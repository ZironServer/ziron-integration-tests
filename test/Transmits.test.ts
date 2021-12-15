/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import Cluster from "./utils/Cluster";
import ClientHelper from "./utils/ClientHelper";
import each from "jest-each";
import {DataType} from "ziron-client";

describe('Transmits tests', () => {

    let cluster = new Cluster();
    let transmitIntoGroup: (receiver: string,msg: any,processComplexTypes: boolean) => void;
    beforeAll(async () => {
        await cluster.init(1);
        const server = await cluster.addServer(3020);
        transmitIntoGroup = (receiver, msg, processComplexTypes) => {
            server.transmitToGroup('group',receiver,msg,{processComplexTypes});
        }
        server.connectionHandler = (socket) => {
            socket.join('group');
            socket.receivers.test = (data,type) => {
                socket.transmit('test',data,{processComplexTypes: type !== DataType.JSON})
            };
        }
    })
    afterAll(async () => cluster.terminate());

    let clientHelper = new ClientHelper();
    beforeEach(async () => {
        clientHelper.createClient(3020,8);
        await clientHelper.connectAll();
    });
    afterEach(() => clientHelper.clear());

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
        });

});