/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

export function waitMs(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r,ms));
}