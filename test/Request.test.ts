/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import Cluster from "./utils/Cluster";
import ClientHelper from "./utils/ClientHelper";
import each from "jest-each";
import {DataType} from "ziron-engine";

describe('Request tests', () => {

    let cluster = new Cluster();
    beforeAll(async () => {
        await cluster.init(1);
        const server = await cluster.addServer(3020);
        server.connectionHandler = (socket) => {
            socket.procedures.test = (data,end,reject,type) => {
                end(data,type !== DataType.JSON);
            };
            socket.receivers.test = (data,type) => {
                socket.transmit('test',data,{processComplexTypes: type !== DataType.JSON})
            };
        }
    })
    afterAll(async () => cluster.terminate());

    let clientHelper = new ClientHelper();
    beforeEach(async () => {
        clientHelper.createClient(3020,1);
        await clientHelper.connectAll();
    });
    afterEach(() => clientHelper.clear());

    describe("Invokes",() => {

        each([
            [
                "chat",
                false
            ],
            [
                {car: {color: 'black'},persons: [{name: 'Tom'}]},
                false
            ],
            [
                new ArrayBuffer(20),
                true
            ],
        ]).it("Should receive the sent data to the procedure back - %#",
            async (data: any, complexDataType: boolean) => {
                const client = clientHelper.getClient(3020);
                const resp = await client.invoke("test",data,{processComplexTypes: complexDataType});
                expect(resp).toStrictEqual(data);
            })

        it("Should receive all 50000 invoke responses", async () => {
            const client = clientHelper.getClient(3020);
            let increaseCounter;
            const promise = new Promise<void>((res,rej) => {
                let receivedCounter = 0;
                const timeout = setTimeout(() => {
                    rej(new Error("Timeout reached"));
                },10000);
                increaseCounter = () => {
                    receivedCounter++;
                    if(receivedCounter === 50000) {
                        res();
                        clearTimeout(timeout);
                    }
                }
            })
            for(let i = 0; i < 50000; i++)
                client.invoke("test",{}).then(increaseCounter);
            await promise;
        })
    });

    describe("Transmits",() => {

        each([
            [
                "chat",
                false
            ],
            [
                {car: {color: 'black'},persons: [{name: 'Tom'}]},
                false
            ],
            [
                new ArrayBuffer(20),
                true
            ],
        ]).it("Should receive the sent data to the receiver back with another transmit - %#",
            async (data: any, complexDataType: boolean) => {
                const client = clientHelper.getClient(3020);
                const resp = new Promise((res) => {
                    client.receivers.test = (data) => res(data);
                })
                await client.transmit("test",data,{processComplexTypes: complexDataType});
                const respData = await resp;
                expect(respData).toStrictEqual(data);
            })
    });
});