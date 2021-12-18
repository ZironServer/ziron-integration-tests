/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import Cluster from "./utils/Cluster";
import ClientHelper from "./utils/ClientHelper";
import each from "jest-each";
import {DataType} from "ziron-client";
import {Socket} from "ziron-worker";

const TRANSMIT_TEST_DATA = [
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
    ]
];

describe('Transmits tests', () => {

    let cluster = new Cluster();
    let transmitToGroup: (receiver: string,msg: any,processComplexTypes: boolean,skipRandomMember?: boolean) => void;
    beforeAll(async () => {
        await cluster.init(1);
        const server = await cluster.addServer(3020);
        transmitToGroup = (receiver, msg, processComplexTypes,skipRandomMember) => {
            let skipMember;
            if(skipRandomMember) {
                skipMember = Object.values(server.clients)[0];
                if(!skipMember) throw new Error("No socket available to skip");
            }
            server.transmitToGroup('group',receiver,msg,{processComplexTypes,skipMember});
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

    each(TRANSMIT_TEST_DATA).it("Should receive the sent data to the receiver back with another transmit - %#",
        async (data: any, complexDataType: boolean) => {
            const client = clientHelper.getClient(3020);
            const resp = new Promise((res) => {
                client.receivers.test = (data) => res(data);
            })
            await client.transmit("test",data,{processComplexTypes: complexDataType});
            const respData = await resp;
            expect(respData).toStrictEqual(data);
        });

    each(TRANSMIT_TEST_DATA).it("Clients from a group should get the transmit into the group - %#",
        async (data: any, complexDataType: boolean) => {
            const clients = clientHelper.getClients(3020);
            const receivePromises = clients.map(client => {
                return new Promise<any>(res => {
                    client.receivers.news = (data) => res(data)
                })
            });
            await transmitToGroup("news",data,complexDataType);
            await Promise.all(receivePromises.map(p => p.then(receivedData => {
                expect(receivedData).toStrictEqual(data);
            })));
        });


    each(TRANSMIT_TEST_DATA).it("Clients from a group should get the transmit into the group except the skipped member - %#",
        async (data: any, complexDataType: boolean) => {
            const clients = clientHelper.getClients(3020);

            let receiveCount = 0;
            clients.forEach(client => {
                client.receivers.news = () => {receiveCount++;}
            });

            await transmitToGroup("news",data,complexDataType,true);

            //wait some time
            await new Promise(r => setTimeout(r,200));

            expect(receiveCount).toStrictEqual(clients.length - 1);
        });

});