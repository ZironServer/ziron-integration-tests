/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import {Server, ServerOptions} from "ziron-worker";
import {BrokerServer} from "ziron-broker";
import {StateServer} from "ziron-state";

export default class Cluster {

    private running: boolean = false;
    private brokers: BrokerServer[] = [];
    private workers: Server[] = [];
    private state: StateServer | null;

    async init(brokerCount: number = 5) {
        if(this.running) this.terminate();
        this.state = new StateServer({
            secret: '',
            logLevel: 0
        });
        await this.state.listen();

        let brokerStartPort = 7778;
        for(let i = 0; i < brokerCount; i++) {
            this.brokers[i] = new BrokerServer({
                join: this.state.joinToken,
                port: brokerStartPort,
                logLevel: 0
            });
            brokerStartPort++;
        }
        await Promise.all(this.brokers.map(broker => broker.joinAndListen()));
        this.running = true;
    }

    async addServer(options?: ServerOptions): Promise<Server>
    async addServer(port: number): Promise<Server>
    async addServer(p: ServerOptions | number = {}): Promise<Server> {
        if(!this.running) throw new Error("Cluster is not initialized yet");
        const options = typeof p === 'number' ? {port: p} as ServerOptions : p;
        options.join = this.state!.joinToken;
        const worker = new Server(options);
        this.workers.push(worker);
        await worker.listen();
        return worker;
    }

    async addServers(ports: number[],options: ServerOptions = {}) {
        return Promise.all(ports.map(port => this.addServer({...options,port})));
    }

    getServers(): Server[] {
        return this.workers;
    }

    terminate(server?: Server) {
       if(server) {
           server.terminate();
           const index = this.workers.indexOf(server);
           if (index !== -1) this.workers.splice(index, 1);
       }
       else {
           this.workers.forEach(broker => broker.terminate());
           this.workers = [];
           this.brokers.forEach(broker => broker.terminate());
           this.brokers = [];
           this.state?.terminate();
           this.state = null;
           this.running = false;
       }
    }

}