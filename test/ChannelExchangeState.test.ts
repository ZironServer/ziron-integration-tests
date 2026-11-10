/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import Cluster from "./utils/Cluster";
import {waitMs} from "./utils/Wait";
import {Server} from "ziron-worker";

jest.setTimeout(30000);

/**
 * What the channel exchange of a server tells about its subscriptions and publishes at the brokers.
 */
describe('Channel exchange state tests', () => {

    const cluster = new Cluster();
    afterEach(() => cluster.terminate());

    async function waitUntil(condition: () => boolean, timeout = 8000) {
        const start = Date.now();
        while(!condition()) {
            if(Date.now() - start > timeout) throw new Error('Condition not reached in time.');
            await waitMs(20);
        }
    }

    function watch(server: Server, channels: string[]): Record<string, boolean[]> {
        const changes: Record<string, boolean[]> = {};
        for(const channel of channels) {
            changes[channel] = [];
            server.channels.onSubscriptionChange(channel, active => changes[channel].push(active));
            server.channels.subscribe(channel);
        }
        return changes;
    }

    it("Should tell when a channel is subscribed at its broker.", async () => {
        await cluster.init(1);
        const server = await cluster.addServer(3110);
        const changes = watch(server, ['a', 'b']);
        await waitUntil(() => changes.a.length > 0 && changes.b.length > 0);
        expect(changes).toEqual({a: [true], b: [true]});
        expect(server.channels.isSubscriptionActive('a')).toBe(true);
        expect(server.channels.isSubscriptionActive('unknown')).toBe(false);
    });

    it("Should tell when channels move to another broker after a broker was terminated.", async () => {
        await cluster.init(2);
        const server = await cluster.addServer(3111);
        const channels = Array.from({length: 20}, (_, i) => 'ch' + i);
        const changes = watch(server, channels);
        await waitUntil(() => channels.every(channel => changes[channel].length > 0));
        cluster.terminateBroker(0);
        await waitUntil(() => channels.some(channel => changes[channel].length >= 3));
        await waitMs(500);
        const moved = channels.filter(channel => changes[channel].length > 1);
        expect(moved.length).toBeGreaterThan(0);
        for(const channel of channels) {
            expect(changes[channel]).toEqual(moved.includes(channel) ? [true, false, true] : [true]);
            expect(server.channels.isSubscriptionActive(channel)).toBe(true);
        }
    });

    it("Should tell about a publish that found no broker.", async () => {
        await cluster.init(1);
        const server = await cluster.addServer(3112);
        const losses: string[] = [];
        server.channels.onPublishLoss(channel => losses.push(channel));
        server.channels.subscribe('news');
        await waitUntil(() => server.channels.isSubscriptionActive('news'));
        cluster.terminateBroker(0);
        await waitUntil(() => !server.channels.isSubscriptionActive('news'));
        await waitMs(300);
        server.channels.publish('news', 'nobody hears it');
        await waitUntil(() => losses.length > 0, 8000);
        expect(losses).toEqual(['news']);
    });
});
