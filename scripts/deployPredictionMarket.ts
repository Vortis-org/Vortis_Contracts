import { toNano } from '@ton/core';
import { PredictionMarket } from '../wrappers/PredictionMarket';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const predictionMarket = provider.open(await PredictionMarket.fromInit());

    await predictionMarket.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(predictionMarket.address);

    // run methods on `predictionMarket`
}
