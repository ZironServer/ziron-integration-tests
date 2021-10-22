/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import {Socket} from "ziron-client";

export default class ClientHelper {

    private clients: Record<number, Socket[]> = {};

    constructor() {}

    getClient(port: number,index: number = 0): Socket{
        return this.clients[port][index];
    }

    createClient(port: number,count: number = 2) {
        if(!this.clients[port]) this.clients[port] = [];
        for(let i = 0; i < count; i++) {
            this.clients[port][i] = new Socket({
                hostname: 'localhost',
                port
            });
        }
    }

    createClients(ports: number[],countPerPort: number = 2) {
        ports.forEach(port => this.createClient(port,countPerPort));
    }

    clear() {
        Object.values(this.clients)
            .forEach(clients => clients
                .forEach(client => client.disconnect()));
        this.clients = {};
    }

    async connectAll(): Promise<void> {
        await Promise.all(Object.values(this.clients)
            .map(clients => Promise.all(clients
                .map(client => client.connect()))));
    }

}