/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import Cluster from "./utils/Cluster";
import ClientHelper from "./utils/ClientHelper";
import {waitMs} from "./utils/Wait";

jest.setTimeout(30000);

describe('Broker failover tests', () => {

    const PORTS = [3050, 3051];
    const cluster = new Cluster();

    beforeAll(async () => {
        await cluster.init(2);
        await cluster.addServers(PORTS);
    });
    afterAll(() => cluster.terminate());

    const clientHelper = new ClientHelper();
    beforeEach(async () => {
        clientHelper.createClients(PORTS, 1);
        await clientHelper.connectAll();
    });
    afterEach(() => clientHelper.clear());

    const expectCrossServerPublish = async (channel: string, data: string) => {
        const subscriber = clientHelper.getClient(PORTS[0]);
        const publisher = clientHelper.getClient(PORTS[1]);
        if(!subscriber.hasSubscribed(channel)) await subscriber.subscribe(channel);
        const listener = jest.fn();
        subscriber.onPublish(channel, listener);
        await publisher.publish(channel, data);
        await subscriber.oncePublish(channel, 3000);
        expect(listener).toHaveBeenCalledWith(data, false);
        subscriber.offPublish(channel, listener);
    };

    it("Should still distribute publishes after a broker was terminated.", async () => {
        await expectCrossServerPublish('news', 'before');
        cluster.terminateBroker(0);
        await waitMs(1500);
        await expectCrossServerPublish('news', 'after broker loss');
        await expectCrossServerPublish('other', 'new channel after broker loss');
    });

    it("Should still distribute publishes while the state server is down.", async () => {
        await expectCrossServerPublish('news', 'before');
        cluster.terminateState();
        await waitMs(500);
        await expectCrossServerPublish('news', 'while state is down');
    });
});
