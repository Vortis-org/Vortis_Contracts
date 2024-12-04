import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano, Cell, beginCell } from '@ton/core';
import { BinaryPredictionMarket } from '../wrappers/PredictionMarket';
import '@ton/test-utils';

describe('PredictionMarket', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let predictionMarket: SandboxContract<BinaryPredictionMarket>;
    let user1: SandboxContract<TreasuryContract>;
    let user2: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');

        user1 = await blockchain.treasury('user1');
        user2 = await blockchain.treasury('user2');

        predictionMarket = blockchain.openContract(await BinaryPredictionMarket.fromInit(deployer.address));

        const deployResult = await predictionMarket.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: predictionMarket.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy correctly', async () => {
        // Contract was deployed in beforeEach
        // Just verify it exists
        const markets = await predictionMarket.getMarkets();
        expect(markets.size).toBe(0);
    });

    it('should create a market', async () => {
        const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

        await predictionMarket.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'CreateMarket',
                id: 1n,
                description: beginCell().storeBuffer(Buffer.from('Will it rain tomorrow?')).endCell(),
                predictionX: beginCell().storeBuffer(Buffer.from('Yes')).endCell(),
                predictionY: beginCell().storeBuffer(Buffer.from('No')).endCell(),
                endTime: BigInt(futureTime),
            },
        );

        const market = await predictionMarket.getGetMarket(1n);
        console.log(market);
        expect(market).toBeDefined();
        expect(market?.id).toBe(1n);
        expect(market?.status).toBe(0n);
    });

    it('should place a bet', async () => {
        // First create a market - THIS IS NECESSARY
        const futureTime = Math.floor(Date.now() / 1000) + 3600;

        await predictionMarket.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'CreateMarket',
                id: 1n,
                description: beginCell().storeBuffer(Buffer.from('Will it rain tomorrow?')).endCell(),
                predictionX: beginCell().storeBuffer(Buffer.from('Yes')).endCell(),
                predictionY: beginCell().storeBuffer(Buffer.from('No')).endCell(),
                endTime: BigInt(futureTime),
            },
        );

        // Then place the bet
        await predictionMarket.send(
            user2.getSender(),
            {
                value: toNano('0.1'),
            },
            {
                $$type: 'PlaceBet',
                marketId: 1n,
                prediction: 2n,
            },
        );

        // Verify the bet
        const bet = await predictionMarket.getGetBet(1n, user2.address);
        console.log(bet);
        expect(bet).toBeDefined();
        expect(bet?.amount).toBe(toNano('0.1'));
        expect(bet?.prediction).toBe(2n);
        expect(bet?.claimed).toBe(false);
    });
});
