type TCreateParams = {
    jobType: any
    inputData?: Record<string, any>
    inputFiles?: Record<string, any>
    estimations?: Record<string, any>
    discardTimeout?: number
    dispatchTimeout?: number
    executeTimeout?: number
    noprogressTimeout?: number
    rescheduleCooldown?: number
    maxTimeoutCount?: number
    maxFailureCount?: number
    maxNotReadyCount?: number
    fallbackHandler?: any
}
type TCreateResponse = Promise<any>

type TGetParams = any
type TGetResponse = Promise<any>

type TUpdateParams = any
type TUpdateResponse = Promise<any>

type TDeleteParams = any
type TDeleteResponse = Promise<any>

type TFindParams = any
type TFindResponse = Promise<any>

type TSignalParams = {
    jobId: any
    state: any
}
type TSignalResponse = Promise<any>

type TUpdateExecutionParams = any
type TUpdateExecutionResponse = Promise<any>

type TSignalExecutionParams = any
type TSignalExecutionResponse = Promise<any>

declare function archimedes(functionName?: string): {
    create: (TCreateParams) => TCreateResponse
    get: (TGetParams) => TGetResponse
    update: (TUpdateParams) => TUpdateResponse
    delete: (TDeleteParams) => TDeleteResponse
    find: (TFindParams) => TFindResponse
    signal: (TSignalParams) => TSignalResponse
    updateExecution: (TUpdateExecutionParams) => TUpdateExecutionResponse
    signalExecution: (TSignalExecutionParams) => TSignalExecutionResponse
}

export = archimedes;
