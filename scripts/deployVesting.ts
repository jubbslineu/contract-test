import { toNano, Address } from '@ton/core';
import { Vesting } from '../wrappers/protocol/Vesting';
import { JettonMaster } from '../wrappers/token/JettonMaster';
import { JettonWallet } from '../wrappers/token/JettonWallet';
import { NetworkProvider } from '@ton/blueprint';
import config from './config/deployVesting.json';

export async function run(provider: NetworkProvider) {
    const vesting = provider.open(
        await Vesting.fromInit(
            Address.parse(config.owner),
            Address.parse(config.jettonMinter)
        )
    );

    await vesting.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    // deploy vesting contract
    await provider.waitForDeploy(vesting.address);

    // instantiate Jetton Master
    const jettonMaster = provider.open(
        JettonMaster.createFromAddress(Address.parse(config.jettonMinter))
    );

    // instantiate deployer's jetton wallet
    const jettonWallet = provider.open(
        JettonWallet.createFromAddress(
            await jettonMaster.getWalletAddress(
                provider.sender().address!
            )
        )
    );

    // send jettons to vesting contract's wallet
    await jettonWallet.sendTransfer(
        provider.sender(),
        {
            value: toNano('0.02'),
            amount: BigInt(config.vestAmount),
            destination: vesting.address,
            responseDestination: await vesting.getOwner(),
            forwardTonAmount: toNano('0.01') // Necessary to notify the vesting contract
        }
    );

    // Start Vesting contract
    await vesting.send(
        provider.sender(),
        {
            value: toNano('0.01'),
        },
        {
            $$type: 'StartVesting',
            queryId: 0n,
            startTime: BigInt(config.startTime),
            endTime: BigInt(config.endTime)
        }
    )

}
