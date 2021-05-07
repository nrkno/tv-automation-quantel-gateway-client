import * as Q from './quantelTypes'
import * as got from 'got'
import { EventEmitter } from 'events'

const CHECK_STATUS_INTERVAL = 3000
const CALL_TIMEOUT = 1000

const literal = <T>(t: T): T => t

/**
 * Remote connection to a [Sofie Quantel Gateway](https://github.com/nrkno/tv-automation-quantel-gateway).
 * Create and initialize a new connection as follows:
 *
 *     const quantelClient = new QuantelGateway()
 *     await quantelCient.init(
 *         'quantel.gateway.url:port', 'quantel.isa.url', undefined, 'default', serverID)
 *
 * If the serverID is not known, before calling `init()` request the details of all servers:
 *
 *     await quantelClient.connectToISA('quantel.isa.url')
 *     const servers = await quantelClient.getServers('default')
 *
 * Then initialize the client as above.
 *
 * Once finished with the class, call `dispose()`.
 */
export class QuantelGateway extends EventEmitter {
	public readonly checkStatusInterval: number = CHECK_STATUS_INTERVAL

	private _gatewayUrl: string | undefined
	private _initialized = false
	private _ISAUrls: string[] = []
	private _zoneId: string | undefined
	private _serverId: number | undefined
	private _monitorInterval: NodeJS.Timer | undefined

	private _statusMessage: string | null = 'Initializing...' // null = all good
	private _cachedServer: Q.ServerInfo | undefined
	private _monitorPorts: MonitorPorts = {}
	private _connected = false

	/** Create a Quantel Gateway client. */
	constructor() {
		super()
	}

	/**
	 * Initialize a Quantel Gateway client, making the required connections.
	 *
	 * in the event that connection to one of them fails.
	 * @param gatewayUrl Location of the associated Quantel Gateway.
	 * @param ISAUrls Locations of the ISA managers (in order of importance).
	 * Multiple entries means that there are a master and one or several slave ISA's.
	 * In the event of failure of the master, the slaves will be tried in order by the Quantel gateway.
	 * @param zoneId Zone identifier, or `undefined` for default.
	 * @param serverId Identifier of the server to be controlled.
	 */
	public async init(
		gatewayUrl: string,
		ISAUrls: string | string[],
		zoneId: string | undefined,
		serverId: number | undefined
	): Promise<void> {
		this._initialized = false // in case we are called again
		this._cachedServer = undefined // reset in the event of a second calling
		this._gatewayUrl = gatewayUrl.replace(/\/$/, '') // trim trailing slash
		if (!this._gatewayUrl.match(/http/)) this._gatewayUrl = 'http://' + this._gatewayUrl

		// Connect to ISA(s):
		await this.connectToISA(ISAUrls)
		this._zoneId = zoneId || 'default'

		// TODO: this is not implemented yet in Quantel gw:
		// const zones = await this.getZones()
		// const zone = _.find(zones, zone => zone.zoneName === this._zoneId)
		// if (!zone) throw new Error(`Zone ${this._zoneId} not found!`)

		await this.setServerId(serverId)

		this._initialized = true
	}

	/**
	 * Request that the Quantel Gateway connects to the given ISA manager.
	 * @param ISAUrls Locations of the ISA managers (in order of importance). Multiple entries means that there are a master and one or several slave ISA's.
	 * @returns Details of the connection created.
	 */
	public async connectToISA(ISAUrls: string | string[]): Promise<Q.ConnectionDetails> {
		this._ISAUrls = Array.isArray(ISAUrls) ? ISAUrls : ISAUrls ? [ISAUrls] : []

		return await this.reconnectToISA()
	}
	public async reconnectToISA(): Promise<Q.ConnectionDetails> {
		const ISAUrl = this._formattedISAUrl

		return await this._ensureGoodResponse<Q.ConnectionDetails>(
			this.sendRaw('POST', `connect/${encodeURIComponent(ISAUrl)}`)
		)
	}

	/**
	 * Sefely dispose of the resources used by this client, stopping monitors.
	 */
	public dispose(): void {
		if (this._monitorInterval) {
			clearInterval(this._monitorInterval)
		}
	}

	/**
	 * Start the process of repeatedly monitoring the status of the attached
	 * Quantel Gateway and onwards to an ISA manager.
	 * @param callbackOnStatusChange Callback function called when
	 * the connection status through to the ISA manager changes.
	 */
	public monitorServerStatus(
		callbackOnStatusChange: (connected: boolean, errorMessage: string | null) => void
	): void {
		const getServerStatus = async (): Promise<string | null> => {
			try {
				this._connected = false
				if (!this._gatewayUrl) return `Gateway URL not set`

				if (!this._serverId) return `QuantelGatewayClient.serverId not set`
				const server = await this.getServer(true)

				if (!server) return `Server ${this._serverId} not found on ISA`
				if (server.down) return `Server ${server.ident} is down`

				this._connected = true

				const serverErrors: string[] = []

				for (const [monitorPortId, monitorPort] of Object.entries(this._monitorPorts)) {
					const portExists = server.portNames
						? server.portNames.find((portName) => portName === monitorPortId)
						: undefined

					const realPortNames = server.portNames ? server.portNames.filter(Boolean) : [] // Filter out falsy names
					if (
						!portExists && // our port is NOT set up on server
						realPortNames.length === (server.numChannels || 0) // There is no more room on server
					) {
						serverErrors.push(
							`Not able to assign port "${monitorPortId}", due to all ports being already used`
						)
					} else {
						for (const monitorChannel of monitorPort.channels) {
							const channelPort = (server.chanPorts || [])[monitorChannel]

							if (
								channelPort && // The channel is assigned to a port
								channelPort !== monitorPortId // The channel is NOT assigned to our port!
							) {
								serverErrors.push(
									`Not able to assign channel to port "${monitorPortId}", the channel ${monitorChannel} is already assigned to another port "${channelPort}"!`
								)
							}
						}
					}
				}
				if (serverErrors.length) return serverErrors.join(', ')

				if (!this._initialized) return `Not initialized`

				return null // all good
			} catch (e) {
				return `Error when monitoring status: ${(e && e.message) || e.toString()}`
			}
		}
		const checkServerStatus = (): void => {
			getServerStatus()
				.then((statusMessage) => {
					if (statusMessage !== this._statusMessage) {
						this._statusMessage = statusMessage
						callbackOnStatusChange(statusMessage === null, statusMessage)
					}
				})
				.catch((e) => this.emit('error', e))
		}
		this._monitorInterval = setInterval(() => {
			checkServerStatus()
		}, this.checkStatusInterval)
		checkServerStatus() // also run one right away
	}

	/** Is the client connected somehow? */
	public get connected(): boolean {
		return this._connected
	}
	/**
	 * Description of the status of the connection.
	 * @returns Current status, or `null` if all is good.
	 */
	public get statusMessage(): string | null {
		return this._statusMessage
	}
	/** Is this client initialized? */
	public get initialized(): boolean {
		return this._initialized
	}
	/** Location of the Quantel Gateway this client targets. */
	public get gatewayUrl(): string {
		return this._gatewayUrl || ''
	}
	/** The Location(s) of the ISA Manager(s) the gateway can connect to. (comma-separated string) */
	public get ISAUrl(): string {
		return this._formattedISAUrl
	}
	public get ISAUrls(): string[] {
		return this._ISAUrls
	}
	/** Get the zone identifier set for this client. */
	public get zoneId(): string {
		return this._zoneId || 'default'
	}
	/** Get the server to be controlled by this client. */
	public get serverId(): number | undefined {
		return this._serverId
	}
	/** Set the server to be controlled by this client. */
	public async setServerId(serverId: number | undefined): Promise<void> {
		this._serverId = serverId

		// If the server is not set, skip this check.
		// (In some cases, the consumer might not want to provide a serverId (like when only we only want to search, never copy))
		if (this._serverId) {
			const server = await this.getServer(true)
			if (!server) throw new Error(`Server ${this._serverId} not found on ISA!`)
		}
	}

	/**
	 * List details of all zones the ISA Manager is connected to.
	 * @returns Details of zones all connected zones.
	 */
	public async getZones(): Promise<Q.ZoneInfo[]> {
		return this._ensureGoodResponse<Q.ZoneInfo[]>(this.sendRaw('GET', ''))
	}

	/**
	 * Get a list of all servers availabe within a zone.
	 * @param zoneId Zone identifier. Omit for `default`.
	 * @returns Details of all the servers within a zone.
	 */
	public async getServers(zoneId?: string): Promise<Q.ServerInfo[]> {
		if (!zoneId) {
			zoneId = 'default'
		}
		return this._ensureGoodResponse<Q.ServerInfo[]>(this.sendRaw('GET', `${zoneId}/server`))
	}

	/** Return the (possibly cached) server */
	public async getServer(disableCache = false): Promise<Q.ServerInfo | null> {
		// Invalidate the cache?
		if (disableCache || this._cachedServer?.ident !== this._serverId) {
			this._cachedServer = undefined
		}

		if (this._cachedServer !== undefined) return this._cachedServer

		if (!this._serverId) throw new Error(`QuantelGatewayClient.serverId not set`)

		const servers = await this.getServers(this._zoneId || 'default')
		const server =
			servers.find((s) => {
				return s.ident === this._serverId
			}) || null
		this._cachedServer = server ? server : undefined
		return server
	}

	/**
	 * Retrieve details of an existing port.
	 * @param portId Identifier for the port to query.
	 * @returns Status of the port, including timings and current playing offset.
	 */
	public async getPort(portId: string): Promise<Q.PortStatus | null> {
		try {
			return await this.sendServer('GET', `port/${portId}`)
		} catch (e) {
			if (this._isNotFoundAThing(e)) return null
			throw e
		}
	}

	/**
	 * Create (allocate) a new port (logical device) and connect it to a channel
	 * (physical SDI connector).
	 * @param portId Name of the port to create.
	 * @param channelId Number of the physical channel to connect the port to.
	 * "returns"
	 */
	public async createPort(portId: string, channelId: number): Promise<Q.PortInfo> {
		return this.sendServer('PUT', `port/${portId}/channel/${channelId}`)
	}

	/**
	 * Release (remove) an allocated port. This allows other applications to grab the
	 * associated channels.
	 * @param portId Identifier of port to remove.
	 * @returns Reported status of the removal.
	 */
	public async releasePort(portId: string): Promise<Q.ReleaseStatus> {
		return this.sendServer('DELETE', `port/${portId}`)
	}

	/**
	 * Reset a port, removing all fragments and resetting the playhead of the port.
	 * The port persists after reset, maintaining ownership of its associated channels.
	 * @returns Status of the release.
	 */
	public async resetPort(portId: string): Promise<Q.ReleaseStatus> {
		return this.sendServer('POST', `port/${portId}/reset`)
	}

	/**
	 * Get infomation about a clip.
	 * @param clipId Identifier for the clip to query.
	 * @returns Resolves with clip details or `null` if the clip is not found.
	 */
	public async getClip(clipId: number): Promise<Q.ClipData | null> {
		try {
			return await this.sendZone<Q.ClipData>('GET', `clip/${clipId}`)
		} catch (e) {
			if (this._isNotFoundAThing(e)) return null
			throw e
		}
	}

	/**
	 * Search for a clip using search query parameters, e.g. `{ Title: 'Trump loses hair' }`
	 * @param searchQuery Details of the requested search.
	 * @returns A list of zero or more search summaries, one for each matching clip.
	 */
	public async searchClip(searchQuery: ClipSearchQuery): Promise<Q.ClipDataSummary[]> {
		return this.sendZone('GET', `clip`, searchQuery)
	}

	/**
	 * Get all the fragments associated with a clip. A clip is a collection of
	 * disk fragments. These fragments must be loaded onto a port to so that a clip
	 * may be played.
	 * @param clipId Identifier of the clip to retrieve the fragments for.
	 * @returns Collection of server fragments that make the requested clip.
	 */
	public async getClipFragments(clipId: number): Promise<Q.ServerFragments>
	/**
	 * Time-bounded request for clip fragments.
	 * @param clipId Identifier of the clip to retrieve the fragments for.
	 * @param inPoint Offset defining the start boundary for clips to be queried.
	 * @param outPoint Offset defining the end boundary for clips to be queried.
	 * @returns Collection of fragments that are contained within or overlap the given
	 * time boundary.
	 */
	public async getClipFragments(
		clipId: number,
		inPoint: number,
		outPoint: number
	): Promise<Q.ServerFragments> // Query fragments for a specific in-out range:
	public async getClipFragments(
		clipId: number,
		inPoint?: number,
		outPoint?: number
	): Promise<Q.ServerFragments> {
		if (inPoint !== undefined && outPoint !== undefined) {
			return this.sendZone('GET', `clip/${clipId}/fragments/${inPoint}-${outPoint}`)
		} else {
			return this.sendZone('GET', `clip/${clipId}/fragments`)
		}
	}

	/**
	 * Load the given fragments onto a port.
	 * @param portId Name of the port to load fragments onto.
	 * @param fragments Fragments to load.
	 * @param offset Specify an offset from that specified in the fragment to load the fragment.
	 * @returns Status of the port load request.
	 */
	public async loadFragmentsOntoPort(
		portId: string,
		fragments: Q.ServerFragmentTypes[],
		offset?: number
	): Promise<Q.PortLoadStatus> {
		const response = this.sendServer<Q.PortLoadStatus>(
			'POST',
			`port/${portId}/fragments`,
			{
				offset: offset
			},
			fragments
		)
		return response
	}

	/** Query the port for which fragments are loaded. */
	public async getFragmentsOnPort(
		portId: string,
		rangeStart?: number,
		rangeEnd?: number
	): Promise<Q.ServerFragments> {
		return this.sendServer<Q.ServerFragments>('GET', `port/${portId}/fragments`, {
			start: rangeStart,
			finish: rangeEnd
		})
		// /:zoneID/server/:serverID/port/:portID/fragments(?start=:start&finish=:finish)
	}

	/**
	 * Start playing on a port at its current offset.
	 * @param portId Name of the port to press play on.
	 * @throws If the play operation was successful.
	 */
	public async portPlay(portId: string): Promise<Q.TriggerResult> {
		const response = await this.sendServer<Q.TriggerResult>('POST', `port/${portId}/trigger/START`)
		if (!response.success)
			throw Error(`Quantel trigger start: Server returned success=${response.success}`)
		return response
	}

	/**
	 * Stop (pause) playback on a port. If `stopAtFrame` is provided, the playback
	 * will stop at the frame specified. Otherwise playback will be paused now.
	 * @param portId Name of the port to pause.
	 * @param stopAtFrame Optional frame-in-the-future at which to stop.
	 * @throws If the pause operation was not successful.
	 */
	public async portStop(portId: string, stopAtFrame?: number): Promise<Q.TriggerResult> {
		const response = await this.sendServer<Q.TriggerResult>('POST', `port/${portId}/trigger/STOP`, {
			offset: stopAtFrame
		})
		if (!response.success)
			throw Error(`Quantel trigger stop: Server returned success=${response.success}`)
		return response
	}

	/** Jump directly to a frame. This might cause flicker on the output, as the frames
	 * haven't been preloaded.
	 * @param portId Name of port to jump on.
	 * @param jumpToFrame Offset of the jump-to point.
	 * @throws If the jump was not successful.
	 */
	public async portHardJump(portId: string, jumpToFrame?: number): Promise<Q.JumpResult> {
		const response = await this.sendServer<Q.JumpResult>('POST', `port/${portId}/trigger/JUMP`, {
			offset: jumpToFrame
		})
		if (!response.success)
			throw Error(`Quantel hard jump: Server returned success=${response.success}`)
		return response
	}

	/**
	 * Prepare a jump to a frame. This ensures that those frames are preloaded and ready
	 * to play.
	 * @param portId Name of the port to prepare a jump on.
	 * @param jumpToFrame Offset to set a jump point to.
	 * @throws If setting the jump was not successful.
	 */
	public async portPrepareJump(portId: string, jumpToFrame?: number): Promise<Q.JumpResult> {
		const response = await this.sendServer<Q.JumpResult>('PUT', `port/${portId}/jump`, {
			offset: jumpToFrame
		})
		if (!response.success)
			throw Error(`Quantel prepare jump: Server returned success=${response.success}`)
		return response
	}

	/**
	 * After preparing a jump, trigger the jump.
	 * @portId Name of the port to trigger a jump on.
	 * @throws If the jump was not successful.
	 */
	public async portTriggerJump(portId: string): Promise<Q.TriggerResult> {
		const response = await this.sendServer<Q.TriggerResult>('POST', `port/${portId}/trigger/JUMP`)
		if (!response.success)
			throw Error(`Quantel trigger jump: Server returned success=${response.success}`)
		return response
	}

	/**
	 * Clear all fragments from a port.
	 * If rangeStart and rangeEnd is provided, will clear the fragments for that time range.
	 * If not, the fragments up until (but not including) the playhead, will be cleared.
	 *
	 * _Dragons_: Including the current offset or end of data inside the range can lead to
	 * unexpected behaviour.
	 * @param portId Name of the port to clear fragments from.
	 * @param rangeStart Start of range to clear fragments from.
	 * @param rangeEnd End range to clear fragments to.
	 * @returns Details of how much was wiped.
	 * @throws If the fragments were not wiped.
	 */
	public async portClearFragments(
		portId: string,
		rangeStart?: number,
		rangeEnd?: number
	): Promise<Q.WipeResult> {
		const response = await this.sendServer<Q.WipeResult>('DELETE', `port/${portId}/fragments`, {
			start: rangeStart,
			finish: rangeEnd
		})
		if (!response.wiped) throw Error(`Quantel clear port: Server returned wiped=${response.wiped}`)
		return response
	}

	/**
	 * Set the ports that are monitored for changes.
	 * @param monitorPorts Dictionary of ports monitored for status change.
	 */
	public setMonitoredPorts(monitorPorts: MonitorPorts): void {
		this._monitorPorts = monitorPorts
	}

	/**
	 * Request that the Quantel gateway kills itself.
	 * If running in Docker configured to auto-restart, calling this method will
	 * cause the gateway to automatically restart.
	 */
	public async kill(): Promise<void> {
		await this.sendBase('POST', 'kill/me/if/you/are/sure')
	}

	/**
	 * Request a clone of a clip, either between zones or between servers in the same zone.
	 * The target zone ID is that of the servers the request is sent to.
	 * @param zoneID Source zone ID, for inter-zone copies only. Otherwise `undefined`.
	 * @param clipID Identifier for the source clip.
	 * @param poolID Target pool identifier.
	 * @param priority Priority level, a value between 0 (low) and 15 (high).  Default is 8 (standard).
	 * @param history For inter-zone cloning, should provenance be carried along with copy? Default is `true`.
	 * @returns Details of the copy, including a `copyID` clip identifier for the target copy.
	 */
	public async copyClip(
		zoneID: number | undefined,
		clipID: number,
		poolID: number,
		priority?: number,
		history?: boolean
	): Promise<Q.CloneResult> {
		const response = await this.sendZone<Q.CloneResult>(
			'POST',
			'copy',
			undefined,
			literal<Q.CloneInfo>({
				zoneID,
				clipID,
				poolID,
				priority,
				history
			})
		)
		return response
	}

	/**
	 * Requests details of an ongoing or completed copy operation.
	 * Note that if the copy completed some time ago or an associated copy operation
	 * did not exist, this will throw a _Not Found_ exception.
	 * @param copyID Identifier of the target clip.
	 * @returns Details of the progress of the copy.
	 */
	public async getCopyRemaining(copyID: number): Promise<Q.CopyProgress> {
		const response = await this.sendZone<Q.CopyProgress>('GET', `copy/${copyID}`)
		return response
	}

	/**
	 * Get the details of all ongoing copy operations.
	 * @returns List of all ongoing copy operations.
	 */
	public async getAllCopyOperations(): Promise<Q.CopyProgress[]> {
		const response = await this.sendZone<Q.CopyProgress[]>('GET', 'copy')
		return response
	}

	private async sendServer<T>(
		method: Methods,
		resource: string,
		queryParameters?: QueryParameters,
		bodyData?: object
	): Promise<T> {
		if (!this._serverId) throw new Error(`QuantelClient.serverId not set`)

		return this.sendZone<T>(
			method,
			`server/${this._serverId}/${resource}`,
			queryParameters,
			bodyData
		)
	}

	private async sendZone<T>(
		method: Methods,
		resource: string,
		queryParameters?: QueryParameters,
		bodyData?: object
	): Promise<T> {
		return this.sendBase<T>(method, `${this._zoneId}/${resource}`, queryParameters, bodyData)
	}

	private async sendBase<T>(
		method: Methods,
		resource: string,
		queryParameters?: QueryParameters,
		bodyData?: object
	): Promise<T> {
		if (!this._initialized) {
			throw new Error('Quantel not initialized yet')
		}
		return this._ensureGoodResponse<T>(
			this.sendRaw<T>(method, `${resource}`, queryParameters, bodyData)
		)
	}

	private async sendRaw<T>(
		method: Methods,
		resource: string,
		queryParameters?: QueryParameters,
		bodyData?: object
	): Promise<T | QuantelErrorResponse> {
		const responseBody = await this.sendRawInner<T>(method, resource, queryParameters, bodyData)

		if (
			this._isAnErrorResponse(responseBody) &&
			responseBody.status === 502 && //
			(responseBody.message + '').match(/first provide a quantel isa/i) // First provide a Quantel ISA connection URL (e.g. POST to /connect)
		) {
			await this.reconnectToISA()
			// Then try again:
			return this.sendRawInner(method, resource, queryParameters, bodyData)
		} else {
			return responseBody
		}
	}

	private async sendRawInner<T>(
		method: Methods,
		resource: string,
		queryParameters?: QueryParameters,
		bodyData?: object
	): Promise<T | QuantelErrorResponse> {
		const url = this.urlQuery(this._gatewayUrl + '/' + resource, queryParameters)
		try {
			const response = await got.default<T>({
				url,
				method,
				json: bodyData,
				timeout: CALL_TIMEOUT,
				responseType: 'json',
				resolveBodyOnly: false
			})
			if (response.statusCode === 200) {
				return response.body
			} else {
				return Promise.reject(`non-200 status code response`)
			}
		} catch (e) {
			if (e.response && e.response.body) {
				return e.response.body
			} else {
				throw e
			}
		}
	}

	private urlQuery(url: string, params: QueryParameters = {}): string {
		const paramStrs: string[] = []
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined) {
				paramStrs.push(`${key}=${encodeURIComponent(value.toString())}`)
			}
		}
		const queryString = paramStrs.join('&')

		return url + (queryString ? `?${queryString}` : '')
	}
	/**
	 * If the response is an error, instead throw the error instead of returning it
	 */
	private async _ensureGoodResponse<T>(pResponse: Promise<T | QuantelErrorResponse>): Promise<T>

	private async _ensureGoodResponse<T>(
		pResponse: Promise<T | QuantelErrorResponse>,
		if404ThenNull: true
	): Promise<T | null>

	private async _ensureGoodResponse<T>(
		pResponse: Promise<T | QuantelErrorResponse>,
		if404ThenNull?: boolean
	): Promise<T | null> {
		const response = await pResponse
		if (this._isAnErrorResponse(response)) {
			if (response.status === 404) {
				if (if404ThenNull) {
					return null
				} else {
					throw new Error(`${response.status} ${response.message}\n${response.stack}`)
				}
			} else {
				throw new Error(`${response.status} ${response.message}\n${response.stack}`)
			}
		}
		return response
	}

	private _isAnErrorResponse<T>(
		response: T | QuantelErrorResponse
	): response is QuantelErrorResponse {
		const test: QuantelErrorResponse = response as QuantelErrorResponse
		return !!(
			test &&
			typeof test === 'object' &&
			Object.prototype.hasOwnProperty.call(test, 'status') &&
			test.status &&
			typeof test.status === 'number' &&
			typeof test.message === 'string' &&
			typeof test.stack === 'string' &&
			test.status !== 200
		)
	}

	private _isNotFoundAThing(e: Error): boolean {
		if (e.message.match(/404/)) {
			return (e.message || '').match('Not found. Request') === null
		}
		return false
	}
	private get _formattedISAUrl(): string {
		if (this._ISAUrls.length) {
			const urls: string[] = []
			for (const url of this._ISAUrls) {
				urls.push(url.replace(/^https?:\/\//, '')) // trim any https://
			}
			return urls.join(',')
		} else {
			throw new Error('Quantel ISAUrls not set!')
		}
	}
}

export interface QuantelErrorResponse {
	status: number
	message: string
	stack: string
}
type QueryParameters = { [key: string]: string | number | undefined }
type Methods = 'POST' | 'GET' | 'PUT' | 'DELETE'

export type Optional<T> = {
	[K in keyof T]?: T[K]
}
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

/**
 * Specify a search query with a list of all properties that must be matched.
 * Propeprties may include a wildcard `*` to match one or more characters and
 * other [MySQL boolean full-text searches](https://dev.mysql.com/doc/refman/8.0/en/fulltext-boolean.html).
 */
export interface ClipSearchQuery {
	/** Limit the maximum number of clips returned */
	limit?: number
	// clip properties

	// ClipDataSummary:
	/** Unique identifier for the clip in this zone. */
	ClipID?: number
	/** Globally-unique identifier for the clip. */
	ClipGUID?: string
	/** Source clip that this clip is a clone of. */
	CloneID?: number
	/** Date and time that the clip was considered complete. */
	Completed?: string
	/** Date and time that the clip was created. */
	Created?: string
	/** Description of the clip. */

	Description?: string
	/** Number of frames in the clip. Will be a number-as-a-string when knwon. */
	Frames?: string
	/** Clip owner. */
	Owner?: string
	/** Disk pool storage location for the clip. */
	PoolID?: number
	/** Title of the clip. */
	Title?: string

	// Q.ClipData:
	Category?: string
	CloneZone?: number
	Destination?: number
	Expiry?: string
	HasEditData?: number
	Inpoint?: number
	JobID?: number
	Modified?: string
	NumAudTracks?: number
	Number?: number
	NumVidTracks?: number
	Outpoint?: number

	PlayAspect?: string
	PublishedBy?: string
	Register?: string
	Tape?: string
	Template?: number
	UnEdited?: number
	PlayMode?: string

	Division?: string
	AudioFormats?: string
	VideoFormats?: string
	Protection?: string
	VDCPID?: string
	PublishCompleted?: string

	[index: string]: string | number | undefined
}

/**
 * Dictionatu of ports monitored for status changes.
 */
export interface MonitorPorts {
	/** Name of the ports being monitored. */
	[portId: string]: {
		/** Phyiscal channels (SDI ports) controlled by the port. */
		channels: number[]
	}
}
