import * as Q from './quantelTypes'
import * as got from 'got'
import { EventEmitter } from 'events'
import * as _ from 'underscore'

const CHECK_STATUS_INTERVAL = 3000
const CALL_TIMEOUT = 1000

const literal = <T>(t: T): T => t

export class QuantelGateway extends EventEmitter {
	public checkStatusInterval: number = CHECK_STATUS_INTERVAL

	private _gatewayUrl: string | undefined
	private _initialized = false
	private _ISAUrl: string | undefined
	private _zoneId: string | undefined
	private _serverId: number | undefined
	private _monitorInterval: NodeJS.Timer | undefined

	private _statusMessage: string | null = 'Initializing...' // null = all good
	private _cachedServer?: Q.ServerInfo | undefined

	constructor() {
		super()
	}

	public async init(
		gatewayUrl: string,
		ISAUrl: string,
		zoneId: string | undefined,
		serverId: number
	): Promise<void> {
		this._initialized = false // in case we are called again
		this._cachedServer = undefined // reset in the event of a second calling
		this._gatewayUrl = gatewayUrl.replace(/\/$/, '') // trim trailing slash
		if (!this._gatewayUrl.match(/http/)) this._gatewayUrl = 'http://' + this._gatewayUrl

		// Connect to ISA:
		await this.connectToISA(ISAUrl)
		this._zoneId = zoneId || 'default'
		this._serverId = serverId

		// TODO: this is not implemented yet in Quantel gw:
		// const zones = await this.getZones()
		// const zone = _.find(zones, zone => zone.zoneName === this._zoneId)
		// if (!zone) throw new Error(`Zone ${this._zoneId} not found!`)

		const server = await this.getServer()
		if (!server) throw new Error(`Server ${this._serverId} not found!`)

		this._initialized = true
	}

	public async connectToISA(ISAUrl?: string): Promise<Q.ConnectionDetails> {
		if (ISAUrl) {
			this._ISAUrl = ISAUrl.replace(/^https?:\/\//, '') // trim any https://
		}
		if (!this._ISAUrl) throw new Error('Quantel connectToIsa: ISAUrl not set!')
		return this._ensureGoodResponse<Q.ConnectionDetails>(
			this.sendRaw('POST', `connect/${encodeURIComponent(this._ISAUrl)}`)
		)
	}

	public dispose(): void {
		if (this._monitorInterval) {
			clearInterval(this._monitorInterval)
		}
	}

	public monitorServerStatus(
		callbackOnStatusChange: (connected: boolean, errorMessage: string | null) => void
	): void {
		const getServerStatus = async (): Promise<string | null> => {
			try {
				if (!this._gatewayUrl) return `Gateway URL not set`

				if (!this._serverId) return `Server id not set`

				const servers = await this.getServers(this._zoneId || 'default')
				const server = _.find(servers, (s) => s.ident === this._serverId)

				if (!server) return `Server ${this._serverId} not present on ISA`
				if (server.down) return `Server ${this._serverId} is down`

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
	public get connected(): boolean {
		return this._statusMessage === null
	}
	public get statusMessage(): string | null {
		return this._statusMessage
	}
	public get initialized(): boolean {
		return this._initialized
	}
	public get gatewayUrl(): string {
		return this._gatewayUrl || ''
	}
	public get ISAUrl(): string {
		return this._ISAUrl || ''
	}
	public get zoneId(): string {
		return this._zoneId || 'default'
	}
	public get serverId(): number {
		return this._serverId || 0
	}

	public async getZones(): Promise<Q.ZoneInfo[]> {
		return this._ensureGoodResponse<Q.ZoneInfo[]>(this.sendRaw('GET', ''))
	}
	public async getServers(zoneId: string): Promise<Q.ServerInfo[]> {
		return this._ensureGoodResponse<Q.ServerInfo[]>(this.sendRaw('GET', `${zoneId}/server`))
	}
	/** Return the (possibly cached) server */
	public async getServer(): Promise<Q.ServerInfo | null> {
		if (this._cachedServer !== undefined) return this._cachedServer

		const servers = await this.getServers(this._zoneId || 'default')
		const server =
			_.find(servers, (server) => {
				return server.ident === this._serverId
			}) || null
		this._cachedServer = server ? server : undefined
		return server
	}

	/** Create a port and connect it to a channel */
	public async getPort(portId: string): Promise<Q.PortStatus | null> {
		try {
			return await this.sendServer('GET', `port/${portId}`)
		} catch (e) {
			if (this._isNotFoundAThing(e)) return null
			throw e
		}
	}
	/**
	 * Create (allocate) a new port
	 */
	public async createPort(portId: string, channelId: number): Promise<Q.PortInfo> {
		return this.sendServer('PUT', `port/${portId}/channel/${channelId}`)
	}
	/**
	 * Release (remove) an allocated port
	 */
	public async releasePort(portId: string): Promise<Q.ReleaseStatus> {
		return this.sendServer('DELETE', `port/${portId}`)
	}
	/**
	 * Reset a port, this removes all fragments and resets the playhead of the port
	 */
	public async resetPort(portId: string): Promise<Q.ReleaseStatus> {
		return this.sendServer('POST', `port/${portId}/reset`)
	}

	/** Get info about a clip */
	public async getClip(clipId: number): Promise<Q.ClipData | null> {
		try {
			return await this.sendZone<Q.ClipData>('GET', `clip/${clipId}`)
		} catch (e) {
			if (this._isNotFoundAThing(e)) return null
			throw e
		}
	}
	public async searchClip(searchQuery: ClipSearchQuery): Promise<Q.ClipDataSummary[]> {
		return this.sendZone('GET', `clip`, searchQuery)
	}
	public async getClipFragments(clipId: number): Promise<Q.ServerFragments>
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
	/** Load specified fragments onto a port */
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
	/** Start playing on a port */
	public async portPlay(portId: string): Promise<Q.TriggerResult> {
		const response = await this.sendServer<Q.TriggerResult>('POST', `port/${portId}/trigger/START`)
		if (!response.success)
			throw Error(`Quantel trigger start: Server returned success=${response.success}`)
		return response
	}
	/** Stop (pause) playback on a port. If stopAtFrame is provided, the playback will stop at the frame specified. */
	public async portStop(portId: string, stopAtFrame?: number): Promise<Q.TriggerResult> {
		const response = await this.sendServer<Q.TriggerResult>('POST', `port/${portId}/trigger/STOP`, {
			offset: stopAtFrame
		})
		if (!response.success)
			throw Error(`Quantel trigger stop: Server returned success=${response.success}`)
		return response
	}
	/** Jump directly to a frame, note that this might cause flicker on the output, as the frames haven't been preloaded  */
	public async portHardJump(portId: string, jumpToFrame?: number): Promise<Q.JumpResult> {
		const response = await this.sendServer<Q.JumpResult>('POST', `port/${portId}/trigger/JUMP`, {
			offset: jumpToFrame
		})
		if (!response.success)
			throw Error(`Quantel hard jump: Server returned success=${response.success}`)
		return response
	}
	/** Prepare a jump to a frame (so that those frames are preloaded into memory) */
	public async portPrepareJump(portId: string, jumpToFrame?: number): Promise<Q.JumpResult> {
		const response = await this.sendServer<Q.JumpResult>('PUT', `port/${portId}/jump`, {
			offset: jumpToFrame
		})
		if (!response.success)
			throw Error(`Quantel prepare jump: Server returned success=${response.success}`)
		return response
	}
	/** After having preloading a jump, trigger the jump */
	public async portTriggerJump(portId: string): Promise<Q.TriggerResult> {
		const response = await this.sendServer<Q.TriggerResult>('POST', `port/${portId}/trigger/JUMP`)
		if (!response.success)
			throw Error(`Quantel trigger jump: Server returned success=${response.success}`)
		return response
	}
	/** Clear all fragments from a port.
	 * If rangeStart and rangeEnd is provided, will clear the fragments for that time range,
	 * if not, the fragments up until (but not including) the playhead, will be cleared
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
	 * Request a clone of a clip, either between zones or between servers in the same zone.
	 * The target zone ID is that of the servers the request is sent to.
	 * @param zoneID Source zone ID, for inter-zone copies only. Otherwise `undefined`.
	 * @param clipID Identifier for the source clip.
	 * @param poolID Target pool identifier.
	 * @param priority Priority level, a value between 0 (low) and 15 (high).  Default is 8 (standard).
	 * @param history For inter-zone cloning, should provenance be carried along with copy? Default is `true`.
	 * @returns Details of the copy, including a `copyID` identifier for the target copy.
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
	// private sendRaw (
	// 	method: Methods,
	// 	resource: string,
	// 	queryParameters?: QueryParameters,
	// 	bodyData?: object
	// ): Promise<any> {

	// 	// This is a temporary implementation, to make the stuff run in order
	// 	return new Promise((resolve, reject) => {
	// 		this._doOnTime.queue(
	// 			0, // run as soon as possible
	// 			undefined,
	// 			(method, resource, bodyData) => {
	// 				return this.sendRaw2(method, resource, queryParameters, bodyData)
	// 				.then(resolve)
	// 				.catch(reject)
	// 			},
	// 			method,
	// 			resource,
	// 			bodyData
	// 		)
	// 	})
	// }
	private async sendRaw<T>(
		method: Methods,
		resource: string,
		queryParameters?: QueryParameters,
		bodyData?: object
	): Promise<T | QuantelErrorResponse> {
		const response = await this.sendRawInner<T>(method, resource, queryParameters, bodyData)

		if (
			this._isAnErrorResponse(response) &&
			response.status === 502 && //
			(response.message + '').match(/first provide a quantel isa/i) // First provide a Quantel ISA connection URL (e.g. POST to /connect)
		) {
			await this.connectToISA()
			// Then try again:
			return this.sendRawInner(method, resource, queryParameters, bodyData)
		} else {
			return response
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
				responseType: 'json'
			})
			if (response.statusCode === 200) {
				return response.body
			} else {
				return Promise.reject(`non-200 status code response`)
			}
		} catch (e) {
			return Promise.reject(e)
		}
	}

	private urlQuery(url: string, params: QueryParameters = {}): string {
		const queryString = _.compact(
			_.map(params, (value, key: string) => {
				if (value !== undefined) {
					return `${key}=${encodeURIComponent(value.toString())}`
				}
				return null
			})
		).join('&')
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
			_.isObject(test) &&
			Object.prototype.hasOwnProperty.call(test, 'status') &&
			test.status &&
			_.isNumber(test.status) &&
			_.isString(test.message) &&
			_.isString(test.stack) &&
			test.status !== 200
		)
	}

	private _isNotFoundAThing(e: Error): boolean {
		if (e.message.startsWith('404')) {
			return (e.message || '').match('Not found. Request') === null
		}
		return false
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
export interface ClipSearchQuery {
	/** Limit the maximum number of clips returned */
	limit?: number
	// clip properties

	// ClipDataSummary:
	ClipID?: number
	CloneID?: number
	Completed?: string
	Created?: string
	Description?: string
	Frames?: string
	Owner?: string
	PoolID?: number
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
	ClipGUID?: string
	Protection?: string
	VDCPID?: string
	PublishCompleted?: string

	[index: string]: string | number | undefined
}
