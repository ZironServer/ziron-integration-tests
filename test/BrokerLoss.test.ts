/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import Cluster from "./utils/Cluster";
import Proxy from "./utils/Proxy";
import {waitMs} from "./utils/Wait";
import {BrokerClientPool} from "ziron-worker";

jest.setTimeout(30000);

/**
 * What a server misses from the broker, and what it is told about it.
 */
describe('Broker loss tests', () => {

    const BROKER_PORT = 7778;
    const cluster = new Cluster();
    let proxyPort = 3090;
    const proxies: Proxy[] = [];
    //subscribe, publish and the listeners are internal
    const pools: any[] = [];

    beforeAll(async () => {
        await cluster.init(1);
    });
    afterAll(() => cluster.terminate());
    afterEach(() => {
        proxies.forEach(proxy => proxy.close());
        proxies.length = 0;
        pools.forEach(pool => pool.destroy());
        pools.length = 0;
    });

    async function pool(viaProxy: boolean): Promise<{pool: any, proxy?: Proxy, received: [string,any][],
        changes: [string,boolean][], losses: string[]}>
    {
        let proxy: Proxy | undefined;
        if(viaProxy) proxies.push(proxy = await Proxy.start(proxyPort++, BROKER_PORT));
        const instance: any = new BrokerClientPool({poolSize: 1, joinTokenSecret: '', clusterVersion: 1,
            uri: `ws://127.0.0.1:${proxy ? proxy.port : BROKER_PORT}`});
        pools.push(instance);
        const received: [string,any][] = [], changes: [string,boolean][] = [], losses: string[] = [];
        instance.onPublish = (channel: string, data: any) => received.push([channel,data]);
        instance.onSubscriptionChange = (channel: string, active: boolean) => changes.push([channel,active]);
        instance.onPublishLoss = (channel: string) => losses.push(channel);
        await waitUntil(() => instance.isConnected());
        return {pool: instance, proxy, received, changes, losses};
    }

    async function waitUntil(condition: () => boolean, timeout = 6000) {
        const start = Date.now();
        while(!condition()) {
            if(Date.now() - start > timeout) throw new Error('Condition not reached in time.');
            await waitMs(20);
        }
    }

    it("Should subscribe a channel whose first subscribe was cut by a lost connection.", async () => {
        const subscriber = await pool(true);
        const publisher = await pool(false);
        subscriber.proxy!.freeze();
        subscriber.pool.subscribe('cut');
        await waitMs(50);
        subscriber.proxy!.drop();
        subscriber.proxy!.unfreeze();
        await waitUntil(() => !subscriber.pool.isConnected());
        await waitUntil(() => subscriber.pool.isConnected());
        await waitMs(300);

        await publisher.pool.publish('cut','after reconnect');
        await waitUntil(() => subscriber.received.length > 0, 2000);
        expect(subscriber.received).toEqual([['cut','after reconnect']]);
    });

    it("Should tell when a subscription was cut and when it is active again.", async () => {
        const subscriber = await pool(true);
        await subscriber.pool.subscribe('state');
        await waitUntil(() => subscriber.changes.length > 0, 2000);
        subscriber.proxy!.drop();
        await waitUntil(() => subscriber.changes.length > 2);
        expect(subscriber.changes).toEqual([['state',true],['state',false],['state',true]]);
    });

    it("Should tell the publisher about a publish that may not have reached the broker.", async () => {
        const subscriber = await pool(false);
        const publisher = await pool(true);
        await subscriber.pool.subscribe('flight');
        publisher.proxy!.freeze();
        await publisher.pool.publish('flight',1);
        await waitMs(50);
        publisher.proxy!.drop();
        publisher.proxy!.unfreeze();
        await waitUntil(() => publisher.pool.isConnected());
        await waitMs(300);
        //either it arrived or the publisher knows that it may not have
        expect(subscriber.received.length === 1 || publisher.losses.includes('flight')).toBe(true);
    });

    it("Should tell about a publish sent after the connection broke and before the socket saw it.", async () => {
        const subscriber = await pool(false);
        const publisher = await pool(true);
        await subscriber.pool.subscribe('window');
        await waitMs(100);
        //the socket of the publisher sees the break only in a later turn: the publish goes into a dead connection
        publisher.proxy!.drop();
        expect(publisher.pool.isConnected()).toBe(true);
        publisher.pool.publish('window',1);
        await waitUntil(() => publisher.losses.length > 0 || subscriber.received.length > 0);
        await waitUntil(() => publisher.pool.isConnected());
        await waitMs(300);
        //either it arrived or the publisher knows that it may not have
        expect(subscriber.received.length === 1 || publisher.losses.includes('window')).toBe(true);
    });

    it("Should not tell about a loss when the broker confirmed the publishes.", async () => {
        const subscriber = await pool(false);
        const publisher = await pool(true);
        await subscriber.pool.subscribe('confirmed');
        for(let i = 0; i < 20; i++) await publisher.pool.publish('confirmed',i);
        await waitUntil(() => subscriber.received.length === 20, 2000);
        await waitMs(100);
        publisher.proxy!.drop();
        await waitUntil(() => publisher.pool.isConnected());
        expect(publisher.losses).toEqual([]);
    });

    it("Should not skip publishes to a slow subscriber (backpressure).", async () => {
        const subscriber = await pool(true);
        const publisher = await pool(false);
        await subscriber.pool.subscribe('slow');
        let disconnects = 0;
        subscriber.pool.clients[0].on('disconnect', () => disconnects++);
        subscriber.proxy!.stall();
        const chunk = "x".repeat(50000), COUNT = 600;
        for(let i = 0; i < COUNT; i++) publisher.pool.publish('slow',[i,chunk]);
        await waitUntil(() => publisher.pool.clients[0].bufferedSendAmount === 0, 10000);
        await waitMs(1000);
        subscriber.proxy!.unstall();
        await waitUntil(() => disconnects > 0 || subscriber.received.length === COUNT);
        const seqs = subscriber.received.map(([,data]) => data[0]);
        //all came in order, or a gapless start and the connection was closed
        expect(seqs).toEqual(seqs.map((_,i) => i));
        if(seqs.length < COUNT) expect(disconnects).toBeGreaterThan(0);
    });
});
