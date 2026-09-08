/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import Cluster from "./utils/Cluster";
import ClientHelper from "./utils/ClientHelper";
import {waitMs} from "./utils/Wait";
import {Server} from "ziron-worker";

jest.setTimeout(20000);

describe('Reconnect tests', () => {

    const PORT = 3040;
    const cluster = new Cluster();
    let server: Server;
    let received: any[] = [];

    beforeAll(async () => {
        await cluster.init(1);
        server = await cluster.addServer(PORT);
        server.connectionHandler = (socket) => {
            socket.procedures.slow = async (data, end) => {
                await waitMs(600);
                end(data);
            };
            socket.receivers.collect = (data) => {received.push(data);};
        }
    });
    afterAll(() => cluster.terminate());

    const clientHelper = new ClientHelper();
    beforeEach(async () => {
        received = [];
        clientHelper.createClient(PORT, 2);
        await clientHelper.connectAll();
    });
    afterEach(() => clientHelper.clear());

    it("Should restore channel subscriptions after a reconnect.", async () => {
        const subscriber = clientHelper.getClient(PORT, 0);
        const publisher = clientHelper.getClient(PORT, 1);
        await subscriber.subscribe('news');
        const publishListener = jest.fn();
        subscriber.onPublish('news', publishListener);

        subscriber.disconnect();
        await waitMs(100);
        await subscriber.connect();
        await waitMs(200);
        expect(subscriber.hasSubscribed('news')).toBe(true);

        await publisher.publish('news', 'after reconnect');
        await subscriber.oncePublish('news', 2000);
        expect(publishListener).toHaveBeenCalledWith('after reconnect', false);
    });

    it("Should reject pending invokes when the connection is lost.", async () => {
        const socket = clientHelper.getClient(PORT, 0);
        const invokePromise = socket.invoke('slow', 'data');
        await waitMs(50);
        socket.disconnect();
        await expect(invokePromise).rejects.toThrow();
    });

    it("Should flush transmits that were buffered while disconnected after the reconnect.", async () => {
        const socket = clientHelper.getClient(PORT, 0);
        socket.disconnect();
        await waitMs(50);
        socket.transmit('collect', 'buffered-1');
        socket.transmit('collect', 'buffered-2');
        await socket.connect();
        await waitMs(300);
        expect(received).toStrictEqual(['buffered-1', 'buffered-2']);
    });

    it("Should not leak server side sockets over reconnects.", async () => {
        const socket = clientHelper.getClient(PORT, 0);
        for(let i = 0; i < 5; i++) {
            socket.disconnect();
            await waitMs(30);
            await socket.connect();
        }
        await waitMs(300);
        expect(server.clientCount).toBe(2);
        expect(Object.keys(server.clients).length).toBe(2);
    });
});
