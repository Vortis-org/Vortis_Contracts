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

        const market = await predictionMarket.getGetMarket(1n);
        expect(market?.totalPool).toBe(toNano('0.1')); // User2's bet only
        expect(market?.poolX).toBe(0n);
        expect(market?.poolY).toBe(toNano('0.1')); // User2's bet in Y pool

        const user2Bet = await predictionMarket.getGetBet(1n, user2.address);
        expect(user2Bet?.amount).toBe(toNano('0.1')); // Fix: Changed from 0.3 to 0.1
        expect(user2Bet?.prediction).toBe(2n);
    });

    it('should close market and decide winner', async () => {
        // Create and place bets first
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

        // Close market
        await predictionMarket.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'CloseMarket',
                marketId: 1n,
            },
        );

        let market = await predictionMarket.getGetMarket(1n);
        console.log(market);
        expect(market?.status).toBe(1n);

        await predictionMarket.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'DecideWinner',
                marketId: 1n,
                winningPrediction: 1n,
            },
        );

        market = await predictionMarket.getGetMarket(1n);
        console.log('winner', market);
        expect(market?.status).toBe(2n);
        expect(market?.winningPrediction).toBe(1n);
    });

    it('should allow winner to claim reward', async () => {
        // Create market and place bets
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

        // User1 bets on YES
        await predictionMarket.send(
            user2.getSender(),
            {
                value: toNano('0.2'),
            },
            {
                $$type: 'PlaceBet',
                marketId: 1n,
                prediction: 2n,
            },
        );

        // // User2 bets on NO
        // await predictionMarket.send(
        //     user2.getSender(),
        //     {
        //         value: toNano('0.2'),
        //     },
        //     {
        //         $$type: 'PlaceBet',
        //         marketId: 1n,
        //         prediction: 2n,
        //     },
        // );

        // Close market and decide YES as winner
        await predictionMarket.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'CloseMarket',
                marketId: 1n,
            },
        );

        await predictionMarket.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'DecideWinner',
                marketId: 1n,
                winningPrediction: 2n, //////second prediction is the winner
            },
        );

        // User1 claims reward
        const balanceBefore = await user2.getBalance();
        console.log('balanceBefore', balanceBefore);
        await predictionMarket.send(
            user2.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'ClaimReward',
                marketId: 1n,
            },
        );

        const balanceAfter = await user2.getBalance();
        console.log('balanceAfter', balanceAfter);
        const reward = balanceAfter - balanceBefore + toNano('0.05'); // Adding back the gas spent
        console.log('reward', reward);
        // Since user1 bet 0.1 TON and total pool is 0.3 TON, they should get around 0.3 TON minus fees
        expect(reward).toBeGreaterThan(toNano('0.15')); // Approximate check accounting for fees

        // Verify bet is marked as claimed
        const bet = await predictionMarket.getGetBet(1n, user2.address);
        expect(bet?.claimed).toBe(true);
    });

    it('should not allow double betting', async () => {
        const futureTime = Math.floor(Date.now() / 1000) + 3600;

        // Create market
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

        // First bet
        await predictionMarket.send(
            user1.getSender(),
            {
                value: toNano('0.1'),
            },
            {
                $$type: 'PlaceBet',
                marketId: 1n,
                prediction: 1n,
            },
        );

        // Second bet should fail
        const doubleBetResult = await predictionMarket.send(
            user1.getSender(),
            {
                value: toNano('0.1'),
            },
            {
                $$type: 'PlaceBet',
                marketId: 1n,
                prediction: 2n,
            },
        );

        expect(doubleBetResult.transactions).toHaveTransaction({
            success: false,
        });
    });
});
