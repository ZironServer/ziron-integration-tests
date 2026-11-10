/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import Cluster from "./utils/Cluster";
import {waitMs} from "./utils/Wait";
import {JSONString} from "ziron-worker";
import {JSONString as ClientJSONString, Socket} from "ziron-client";

jest.setTimeout(30000);

/**
 * Publishes of prepared JSON (JSONString): over the broker, to the sockets of a server and from a client.
 */
describe('Prepared JSON tests', () => {

    const cluster = new Cluster();
    const sockets: Socket[] = [];
    afterEach(() => {
        sockets.forEach(socket => socket.disconnect());
        sockets.length = 0;
        cluster.terminate();
    });

    async function waitUntil(condition: () => boolean, timeout = 8000) {
        const start = Date.now();
        while(!condition()) {
            if(Date.now() - start > timeout) throw new Error('Condition not reached in time.');
            await waitMs(20);
        }
    }

    /** A connected client that keeps the messages it sends and gets. */
    async function client(port: number) {
        const socket = new Socket({hostname: 'localhost', port});
        sockets.push(socket);
        await socket.connect();
        const sent: string[] = [], got: string[] = [];
        const transport = (socket as any)._transport;
        const send = transport.send;
        transport.send = (message: any) => {
            if(typeof message === 'string') sent.push(message);
            send(message);
        };
        const emit = transport.emitMessage.bind(transport);
        transport.emitMessage = (message: any) => {
            if(typeof message === 'string') got.push(message);
            emit(message);
        };
        return {socket, sent, got};
    }

    const value = {title: 'Saal "1"', seats: [1, 2, 3], nested: {ok: true, text: 'ü\n'}};

    it("Should publish prepared JSON over the broker like the value.", async () => {
        await cluster.init(1);
        const [from, to] = await cluster.addServers([3130, 3131]);
        const local: any[] = [], received: [any, boolean][] = [];
        from.channels.subscribe('pj');
        from.channels.onPublish('pj', data => local.push(data));
        to.channels.subscribe('pj');
        to.channels.onPublish('pj', (data, external) => received.push([data, external]));
        await waitUntil(() => to.channels.isSubscriptionActive('pj') && from.channels.isSubscriptionActive('pj'));

        const json = new JSONString(JSON.stringify(value));
        from.channels.publish('pj', json);
        from.channels.publish('pj', value);
        await waitUntil(() => received.length === 2);
        expect(received).toEqual([[value, true], [value, true]]);
        //the listeners of the server itself get what it published
        expect(local[0]).toBe(json);
        expect(local[1]).toBe(value);
    });

    it("Should publish binaries over the broker the way of objects.", async () => {
        await cluster.init(1);
        const [from, to] = await cluster.addServers([3132, 3133]);
        const received: any[] = [];
        to.channels.subscribe('bin');
        to.channels.onPublish('bin', (data, _external, complexTypes) => received.push([data, complexTypes]));
        await waitUntil(() => to.channels.isSubscriptionActive('bin'));
        from.channels.publish('bin', {name: 'cover', image: new Uint8Array([1, 2, 250]).buffer}, {processComplexTypes: true});
        await waitUntil(() => received.length === 1);
        const [data, complexTypes] = received[0];
        expect(complexTypes).toBe(true);
        expect(data.name).toBe('cover');
        expect(new Uint8Array(data.image)).toEqual(new Uint8Array([1, 2, 250]));
    });

    it("Should send the sockets of the servers the same message for prepared JSON as for the value.", async () => {
        await cluster.init(1);
        const [from, to] = await cluster.addServers([3134, 3135]);
        const near = await client(3134), far = await client(3135);
        const nearData: any[] = [], farData: any[] = [];
        await near.socket.subscribe('pj');
        await far.socket.subscribe('pj');
        near.socket.onPublish('pj', data => nearData.push(data));
        far.socket.onPublish('pj', data => farData.push(data));
        await waitUntil(() => from.channels.isSubscriptionActive('pj') || to.channels.isSubscriptionActive('pj'));
        await waitMs(300);

        near.got.length = far.got.length = 0;
        from.channels.publish('pj', new JSONString(JSON.stringify(value)));
        await waitUntil(() => nearData.length === 1 && farData.length === 1);
        from.channels.publish('pj', value);
        await waitUntil(() => nearData.length === 2 && farData.length === 2);
        expect(nearData).toEqual([value, value]);
        expect(farData).toEqual([value, value]);
        expect(near.got.length).toBe(2);
        expect(near.got[0]).toBe(near.got[1]);
        expect(far.got.length).toBe(2);
        expect(far.got[0]).toBe(far.got[1]);
    });

    it("Should send the same message for a publish of prepared JSON from a client as for the value.", async () => {
        await cluster.init(1);
        await cluster.addServer(3136);
        const publisher = await client(3136), subscriber = await client(3136);
        const received: any[] = [];
        await subscriber.socket.subscribe('pj');
        subscriber.socket.onPublish('pj', data => received.push(data));
        publisher.sent.length = 0;
        await publisher.socket.publish('pj', new ClientJSONString(JSON.stringify(value)), {batch: null});
        await publisher.socket.publish('pj', value, {batch: null});
        await publisher.socket.publish('pj', new ClientJSONString(JSON.stringify(value)), {batch: null, ack: true});
        await publisher.socket.publish('pj', value, {batch: null, ack: true});
        await waitUntil(() => received.length === 4);
        expect(received).toEqual([value, value, value, value]);
        expect(publisher.sent.length).toBe(4);
        expect(publisher.sent[0]).toBe(publisher.sent[1]);
        //invokes differ only by their call id
        const withoutCallId = (message: string) => message.replace(/^(\d+,"[^"]*",)\d+,/, '$1');
        expect(withoutCallId(publisher.sent[2])).toBe(withoutCallId(publisher.sent[3]));
    });
});
