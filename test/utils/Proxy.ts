/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import * as net from "net";

/**
 * A TCP proxy to a target port.
 * drop() cuts the connections, freeze() holds and later loses
 * what is sent until then (like a network that broke without notice).
 */
export default class Proxy {

    private readonly server: net.Server;
    private readonly pairs = new Set<[net.Socket, net.Socket]>();
    private frozen = false;

    private constructor(readonly port: number, public target: number) {
        this.server = net.createServer((client) => {
            const upstream = net.connect(this.target, '127.0.0.1');
            const pair: [net.Socket, net.Socket] = [client, upstream];
            this.pairs.add(pair);
            client.on('data', chunk => {if(!this.frozen) upstream.write(chunk);});
            upstream.on('data', chunk => {if(!this.frozen) client.write(chunk);});
            const end = () => {
                this.pairs.delete(pair);
                client.destroy();
                upstream.destroy();
            };
            client.on('close', end); upstream.on('close', end);
            client.on('error', end); upstream.on('error', end);
        });
    }

    static async start(port: number, target: number): Promise<Proxy> {
        const proxy = new Proxy(port, target);
        await new Promise<void>(resolve => proxy.server.listen(port, '127.0.0.1', () => resolve()));
        return proxy;
    }

    /**
     * Data sent while frozen is lost.
     */
    freeze() {
        this.frozen = true;
    }

    unfreeze() {
        this.frozen = false;
    }

    /**
     * Stops reading from the target, so its send buffer fills up.
     */
    stall() {
        for(const [, upstream] of this.pairs) upstream.pause();
    }

    unstall() {
        for(const [, upstream] of this.pairs) upstream.resume();
    }

    drop() {
        for(const [client, upstream] of this.pairs) {
            client.destroy();
            upstream.destroy();
        }
        this.pairs.clear();
    }

    close() {
        this.drop();
        this.server.close();
    }
}
