/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type VideoJob = {
    jobId?: string;
    status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    progress?: number;
    outputPath?: string | null;
    error?: string | null;
};

