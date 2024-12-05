import { toNano } from '@ton/core';
import { BinaryPredictionMarket } from '../wrappers/PredictionMarket';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const ownerAddress = Address.parse(''); // Replace with actual owner address

    const predictionMarket = provider.open(await BinaryPredictionMarket.fromInit());

    await predictionMarket.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        },
    );

    await provider.waitForDeploy(predictionMarket.address);

    // run methods on `predictionMarket`
}
