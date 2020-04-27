export type DateString = string // it's a string with an ISO-date in it

export interface ZoneInfo {
	type: 'ZonePortal'
	zoneNumber: number
	zoneName: string
	isRemote: boolean
}

export interface ServerInfo {
	type: 'Server'
	ident: number
	down: boolean
	name?: string
	numChannels?: number
	pools?: number[]
	portNames?: string[]
	chanPorts?: string[]
}

export interface PortRef {
	serverID: number | string
	portName: string
}

export interface PortInfo extends PortRef {
	type?: 'PortInfo'
	channelNo: number
	portID?: number
	audioOnly?: boolean
	assigned?: boolean
}

export interface PortStatus extends PortRef {
	type: 'PortStatus'
	portID: number
	refTime: string
	portTime: string
	speed: number
	offset: number
	status: string
	endOfData: number
	framesUnused: number
	outputTime: string
	channels: number[]
	videoFormat: string
}

export interface ReleaseRef extends PortRef {
	resetOnly?: boolean
}

export interface ReleaseStatus extends ReleaseRef {
	type: 'ReleaseStatus'
	released: boolean
	resetOnly: boolean
}

export interface ClipRef {
	clipID: number
}

export interface FragmentRef extends ClipRef {
	start?: number
	finish?: number
}

export interface PortFragmentRef extends PortRef {
	start?: number
	finish?: number
}

export interface ClipPropertyList {
	// Use property 'limit' of type number to set the maximum number of values to return
	[name: string]: string | number
}

export interface ClipDataSummary {
	type: 'ClipDataSummary' | 'ClipData'
	ClipID: number
	ClipGUID: string
	CloneId: number | null
	Completed: DateString | null
	Created: DateString // ISO-formatted date
	Description: string
	Frames: string // TODO ISA type is None ... not sure whether to convert to number
	Owner: string
	PoolID: number | null
	Title: string
}

export interface ClipData extends ClipDataSummary {
	type: 'ClipData'
	Category: string
	CloneZone: number | null
	Destination: number | null
	Expiry: DateString | null // ISO-formatted date
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

export interface PortLoadStatus extends PortRef {
	type: 'PortLoadStatus'
	fragmentCount: number
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

export interface ConnectionDetails {
	type: string
	isaIOR: string
	href: string
	refs: string[]
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

export interface CloneInfo {
	zoneID?: number // Source zone ID, omit for local zone
	clipID: number // Source clip ID
	poolID: number // Destination pool ID
	priority?: number // Priority, between 0 (low) and 15 (high) - default is 8 (standard)
	history?: boolean // Should an interzone clone link to historical provinance - default is true
}

export interface CloneResult extends CloneInfo {
	type: 'CloneResult'
	copyID: number
	copyCreated: boolean
}

export interface CopyProgress extends ClipRef {
	type: 'CopyProgress'
	totalProtons: number
	protonsLeft: number
	secsLeft: number
	priority: number
	ticketed: boolean
}
