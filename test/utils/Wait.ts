/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

export function waitMs(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r,ms));
}