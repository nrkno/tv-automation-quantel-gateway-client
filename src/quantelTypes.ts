/**
 * Interfaces for values sent to and from a Quantel Gateway.
 */

/** The Quantel Gateway uses ISO-date formatted strings for date and time values. */
export type DateString = string // it's a string with an ISO-date in it

/**
 * Details of a zone.
 */
export interface ZoneInfo {
	type: 'ZonePortal'
	/** Identifier for the zone. */
	zoneNumber: number
	/** Name of the zone. */
	zoneName: string
	/** Is the zone a remote zone? Otherwise it is locally managed. */
	isRemote: boolean
}

/**
 * Details of an SQ server.
 */
export interface ServerInfo {
	type: 'Server'
	/** Identifier of the server. */
	ident: number
	/** Is the server currently down (not running)? */
	down: boolean
	/** Name. */
	name?: string
	/** How many channels (SDI ports) does the server have. */
	numChannels?: number
	/** List of all the disk pools attached to the server. */
	pools?: number[]
	/** Currently assigned ports names. */
	portNames?: string[]
	/** Channel-indexed sparse array of mappings from channels to ports. */
	chanPorts?: string[]
}

/**
 * Reference to a port (logical control device) within a zone.
 */
export interface PortRef {
	/** Name or numerical identifier for a server. */
	serverID: number | string
	/** Name of the port. */
	portName: string
}

/**
 * Details of a port (logical control device).
 */
export interface PortInfo extends PortRef {
	type?: 'PortInfo'
	/** Channel number (physical SDI connector) associated with the port. */
	channelNo: number
	/** Numberical identifier of the port. */
	portID?: number
	/** Is the port set up for audio only? */
	audioOnly?: boolean
	/** Is the port assigned to a channel? */
	assigned?: boolean
}

/** Compound states that a port may be in. */
type StatusOfPort =
	| 'readyToPlay'
	| 'playing'
	| 'playing&readyToPlay'
	| 'jumpReady'
	| 'jumpReady&readyToPlay'
	| 'jumpReady&playing'
	| 'jumpReady&readyToPlay&playing'
	| 'fading'
	| 'unknown'

/** Snapshot of the current status of a port. */
export interface PortStatus extends PortRef {
	type: 'PortStatus'
	/** Numerical identifier for the port. */
	portID: number
	/** Wallclock or station reference time derived from server reference feed. */
	refTime: string
	/** Time on input port. */
	portTime: string
	/** Play speed of the port, e.g. 1.0 for normal playback, 0.0 for stopped. */
	speed: number
	/** Current offset of the play or record head on the port. */
	offset: number
	/** What state or states is the port in? */
	status: StatusOfPort
	/** Offset+1 of frame at which data ends. */
	endOfData: number
	/** Number of frames since the Port was last given a valid command or transferred a frame. */
	framesUnused: number
	/** Timecode being generated on output. */
	outputTime: string
	/** Channels controlled by the port. */
	channels: number[]
	/** Video format configured for the port, e.g. 1080i50. */
	videoFormat: string
}

export interface ReleaseRef extends PortRef {
	/** Was the port only reset as part of the release, not fully freed? */
	resetOnly?: boolean
}

/**
 * Details of the status reported for releasing a port.
 */
export interface ReleaseStatus extends ReleaseRef {
	type: 'ReleaseStatus'
	/** Was the port realeased successfully? */
	released: boolean
	resetOnly: boolean
}

/**
 * Reference to a clip
 */
export interface ClipRef {
	/** Identifier of the clip this message refers to. */
	clipID: number
}

/**
 * Reference used to query clip fragments, allowing for time-bounded queries.
 */
export interface FragmentRef extends ClipRef {
	/** Start offset for query boundary. Zero assumed when omitted. */
	start?: number
	/** End offset of query boundary. Maximum offset assumed when omitted. */
	finish?: number
}

/**
 * Reference used to query fragments on a port, allowing for time-bounded
 * queries.
 */
export interface PortFragmentRef extends PortRef {
	/** Start offset for query boundary. Zero assumed when omitted. */
	start?: number
	/** End offset of query boundary. Maximum offset assumed when omitted. */
	finish?: number
}

// Quantel client has specific properties enumberated for searches.
//   See ClipSearchQuery interface.
// export interface ClipPropertyList {
// 	// Use property 'limit' of type number to set the maximum number of values to return
// 	[name: string]: string | number
// }

/**
 * Summmary details for a clip reported as the result of a search.
 */
export interface ClipDataSummary {
	type: 'ClipDataSummary' | 'ClipData'
	/** Unique identifier for the clip in this zone. */
	ClipID: number
	/** Globally-unique identifier for the clip. */
	ClipGUID: string
	/** Source clip that this clip is a clone of. */
	CloneId: number | null
	/** Date and time that the clip was considered complete. */
	Completed: DateString | null
	/** Date and time that the clip was created. */
	Created: DateString // ISO-formatted date
	/** Description of the clip. */

	Description: string
	/** Number of frames in the clip. Will be a number-as-a-string when knwon. */
	Frames: string // TODO ISA type is None ... not sure whether to convert to number
	/** Clip owner. */
	Owner: string
	/** Disk pool storage location for the clip. */
	PoolID: number | null
	/** Title of the clip. */
	Title: string
}

export interface ClipData extends ClipDataSummary {
	type: 'ClipData'
	/** Clip category. Sometimes used to identify a managing agent MAM. */
	Category: string
	/** Where the clip was copied from another zone, identifier of the source zone. */
	CloneZone: number | null
	Destination: number | null
	/** Date and time after which it is safe to remove the clip. */
	Expiry: DateString | null // ISO-formatted date
	/** Does the clip have associated edit data? */
	HasEditData: number | null
	Inpoint: number | null
	JobID: number | null
	Modified: string | null
	NumAudTracks: number | null
	Number: number | null
	NumVidTracks: number | null
	Outpoint: number | null
	PlaceHolder: boolean
	PlayAspect: string
	PublishedBy: string
	Register: string
	Tape: string
	Template: number | null
	UnEdited: number | null
	PlayMode: string
	MosActive: boolean
	Division: string
	AudioFormats: string
	VideoFormats: string
	Protection: string
	VDCPID: string
	PublishCompleted: DateString | null // ISO-formatted date
}

export interface ServerFragment {
	type: string
	trackNum: number
	start: number
	finish: number
}

export type ServerFragmentTypes =
	| VideoFragment
	| AudioFragment
	| AUXFragment
	| FlagsFragment
	| TimecodeFragment
	| AspectFragment
	| CropFragment
	| PanZoomFragment
	| SpeedFragment
	| MultiCamFragment
	| CCFragment
	| NoteFragment
	| EffectFragment

export interface PositionData extends ServerFragment {
	rushID: string
	format: number
	poolID: number
	poolFrame: number
	skew: number
	rushFrame: number
}

export interface VideoFragment extends PositionData {
	type: 'VideoFragment'
}

export interface AudioFragment extends PositionData {
	type: 'AudioFragment'
}

export interface AUXFragment extends PositionData {
	type: 'AUXFragment'
}

export interface FlagsFragment extends ServerFragment {
	type: 'FlagsFragment'
	flags: number
}

export interface TimecodeFragment extends ServerFragment {
	startTimecode: string
	userBits: number
}

export interface AspectFragment extends ServerFragment {
	type: 'AspectFragment'
	width: number
	height: number
}

export interface CropFragment extends ServerFragment {
	type: 'CropFragment'
	x: number
	y: number
	width: number
	height: number
}

export interface PanZoomFragment extends ServerFragment {
	type: 'PanZoomFragment'
	x: number
	y: number
	hZoom: number
	vZoon: number
}

export interface SpeedFragment extends ServerFragment {
	type: 'SpeedFragment'
	speed: number
	profile: number
}

export interface MultiCamFragment extends ServerFragment {
	type: 'MultiCamFragment'
	stream: number
}

export interface CCFragment extends ServerFragment {
	type: 'CCFragment'
	ccID: string
	ccType: number
	effectID: number
}

export interface NoteFragment extends ServerFragment {
	type: 'NoteFragment'
	noteID: number
	aux: number
	mask: number
	note: string | null
}

export interface EffectFragment extends ServerFragment {
	type: 'EffectFragment'
	effectID: number
}

export interface ServerFragments extends ClipRef {
	type: 'ServerFragments'
	fragments: ServerFragmentTypes[]
}

export interface PortServerFragments extends ServerFragments, PortRef {
	clipID: -1
}

export interface PortLoadInfo extends PortRef {
	fragments: ServerFragmentTypes[]
	offset?: number
}

/**
 * Status after loading fragments onto a port.
 */
export interface PortLoadStatus extends PortRef {
	type: 'PortLoadStatus'
	/** Number of fragments loaded onto the port. */
	fragmentCount: number
	/** Offset at which fragments were loaded. */
	offset: number
}

export enum Trigger {
	START = 'START', // quantel.START
	STOP = 'STOP', // quantel.STOP
	JUMP = 'JUMP', // quantel.JUMP
	TRANSITION = 'TRANSITION' // quantel.TRANSITION
}

export enum Priority {
	STANDARD = 'STANDARD', // quantel.STANDARD
	HIGH = 'HIGH' // quantel.HIGH
}

export interface TriggerInfo extends PortRef {
	trigger: Trigger
	offset?: number
}

export interface TriggerResult extends TriggerInfo {
	type: 'TriggerResult'
	success: boolean
}

export interface JumpInfo extends PortRef {
	offset: number
}

export interface JumpResult extends JumpInfo {
	type: 'HardJumpResult' | 'TriggeredJumpResult'
	success: boolean
}

export interface ThumbnailSize {
	width: number
	height: number
}

export interface ThumbnailOrder extends ClipRef {
	offset: number
	stride: number
	count: number
}

/**
 * Details of a connection from a Quantel Gateway to an ISA manager.
 */
export interface ConnectionDetails {
	type: 'ConnectionDetails'
	/** CORBA-encoded ISA manager connection details. */
	isaIOR: string
	/** Location of the attached ISA manager. */
	href: string
	/** List of alternative ISA managers, e.g. master and backup. */
	refs: string[]
	/** Incrementing round robim counter used to select the next ISA manager on failure. */
	robin: number
}

export interface CloneRequest extends ClipRef {
	poolID: number
	highPriority?: boolean
}

export interface WipeInfo extends PortRef {
	start?: number
	frames?: number
}

export interface WipeResult extends WipeInfo {
	type: 'WipeResult'
	wiped: boolean
}

export interface FormatRef {
	formatNumber: number
}

export interface FormatInfo extends FormatRef {
	type: 'FormatInfo'
	essenceType:
		| 'VideoFragment'
		| 'AudioFragment'
		| 'AUXFragment'
		| 'FlagsFragment'
		| 'TimecodeFragment'
		| 'AspectFragment'
		| 'CropFragment'
		| 'PanZoomFragment'
		| 'MultiCamFragment'
		| 'CCFragment'
		| 'NoteFragment'
		| 'EffectFragment'
		| 'Unknown'
	frameRate: number
	height: number
	width: number
	samples: number
	compressionFamily: number
	protonsPerAtom: number
	framesPerAtom: number
	quark: number
	formatName: string
	layoutName: string
	compressionName: string
}

/**
 * Details of a request to clone a clip, if cloning is required.
 */
export interface CloneInfo {
	/** Source zone ID, for inter-zone copies only. Otherwise `undefined`. */
	zoneID?: number
	/** Identifier for the source clip. */
	clipID: number
	/** Target pool identifier. */
	poolID: number
	/** Priority level, a value between 0 (low) and 15 (high). Default is 8 (standard). */
	priority?: number
	/** For inter-zone cloning, should provenance be carried along with copy? Default is `true`. */
	history?: boolean
}

/**
 * Response to the request to clone a clip if it does not already exist on a given
 * zone or pool, or the identifier of an existing useable clip.
 */
export interface CloneResult extends CloneInfo {
	type: 'CloneResult'
	/** Clip identifier of the target of the copy, which may be a pre-existing clip ID. */
	copyID: number
	/** Whether it was necessary to start a copy operation, otherwise a copy already existed. */
	copyCreated: boolean
}

/**
 * Details of the progress of a copy operation for a copy target with `clipID`.
 */
export interface CopyProgress extends ClipRef {
	type: 'CopyProgress'
	/** Total number of units of quantel storage. */
	totalProtons: number
	// TODO check this definition and Quantel gateway readme
	/** Units of storage remaining to copy. `protonsLeft / totalProtons` is percentage remaining. */
	protonsLeft: number
	/**
	 * If positive, estimate of the number of seconds remaining until the copy completes.
	 * If negative, the number of seconds have passed since the copy completed.
	 */
	secsLeft: number
	/** Relative priority of the copy, from 0 (low) to 15 (high). Default is 8 (standard). */
	priority: number
	/** Whether the copy operation was ticketed. Expect `false` as not implemented by Quantel gateway. */
	ticketed: boolean
}
