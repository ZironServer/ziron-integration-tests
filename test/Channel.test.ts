/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import Cluster from "./utils/Cluster";
import ClientHelper from "./utils/ClientHelper";
import each from "jest-each";
import {waitMs} from "./utils/Wait";

describe('Channel tests', () => {

    describe("Distribution of published messages",() => {

        const WORKER_PORTS = [3020,3021,3022,3023];
        let cluster = new Cluster();
        beforeAll(async () => {
            await cluster.init(5);
            await cluster.addServers(WORKER_PORTS);
        })
        afterAll(async () => cluster.terminate());

        let clientHelper = new ClientHelper();
        beforeEach(async () => {
            clientHelper.createClients(WORKER_PORTS);
            await clientHelper.connectAll();
        });
        afterEach(() => clientHelper.clear());

        each([
            [
                [WORKER_PORTS[0],0],[WORKER_PORTS[0],1],
                "chat",
                "hello",
                false
            ],
            [
                [WORKER_PORTS[0]],[WORKER_PORTS[1]],
                "stream",
                "how are you?",
                false
            ],
            [
                [WORKER_PORTS[2]],[WORKER_PORTS[1]],
                "profile",
                {image: new ArrayBuffer(10), name: 'Luca'},
                true
            ],
            [
                [WORKER_PORTS[2]],[WORKER_PORTS[0]],
                "image",
                new ArrayBuffer(30),
                true
            ],
            [
                [WORKER_PORTS[0],0],[WORKER_PORTS[0],1],
                "photo",
                new ArrayBuffer(10),
                true
            ],
        ]).it("Should transmit the publish to all subscribers - %#",
            async (client1: [number,number], client2: [number,number], channel: string, data: any, complexDataType: boolean) =>
            {
                const socket1 = clientHelper.getClient(...client1);
                const socket2 = clientHelper.getClient(...client2);

                await socket1.subscribe(channel);

                const mockPublishEvent = jest.fn();
                socket1.onPublish(channel,mockPublishEvent);

                await socket2.publish(channel,data,{processComplexTypes: complexDataType});

                await socket1.oncePublish(channel,1000);
                expect(mockPublishEvent).toBeCalledWith(data,complexDataType);
            })
    });

    describe("Publish to publisher option", () => {
        let cluster = new Cluster();
        beforeAll(async () => {
            await cluster.init(5);
            await cluster.addServer({
                port: 3031,
                publishToPublisher: true,
            });
            await cluster.addServer({
                port: 3032,
                publishToPublisher: false,
            })
        })
        afterAll(async () => cluster.terminate());

        let clientHelper = new ClientHelper();
        beforeEach(async () => {
            clientHelper.createClients([3031,3032]);
            await clientHelper.connectAll();
        });
        afterEach(() => clientHelper.clear());

        it("Should not get its own publish when the option is deactivated", async () => {
            const socket = clientHelper.getClient(3032);
            await socket.subscribe("chat1");
            const mockPublishEvent = jest.fn();
            socket.onPublish("chat1",mockPublishEvent);
            await socket.publish("chat1","hello");
            await waitMs(500);
            expect(mockPublishEvent).not.toBeCalled();
        });

        it("Should get its own publish when the option is activated", async () => {
            const socket = clientHelper.getClient(3031);
            await socket.subscribe("chat2");
            const mockPublishEvent = jest.fn();
            socket.onPublish("chat2",mockPublishEvent);
            await socket.publish("chat2","hello");
            await waitMs(500);
            expect(mockPublishEvent).toBeCalledWith("hello",false);
        });

    })

    describe("Client publish option", () => {
        let cluster = new Cluster();
        beforeAll(async () => {
            await cluster.init(5);
            await cluster.addServer({
                port: 3035,
                allowClientPublish: false
            })
        })
        afterAll(async () => cluster.terminate());

        let clientHelper = new ClientHelper();
        beforeEach(async () => {
            clientHelper.createClient(3035)
            await clientHelper.connectAll();
        });
        afterEach(() => clientHelper.clear());

        it("Should not be able to publish with allowClientPublish option disabled", async () => {
            const socket1 = clientHelper.getClient(3035);
            const socket2 = clientHelper.getClient(3035,1);

            await socket2.subscribe("chat");
            const mockPublishEvent = jest.fn();
            socket2.onPublish("chat",mockPublishEvent);

            await socket1.publish("chat","hello");

            await waitMs(500);
            expect(mockPublishEvent).not.toBeCalled();
        });

    })
});