import { Blockchain, SandboxContract, TreasuryContract, BlockchainSnapshot, EventMessageSent } from '@ton/sandbox';
import { beginCell, toNano, Cell, Address, Dictionary  } from '@ton/core';
import { ToygerMinter } from '../wrappers/protocol/ToygerMinter';
import { ToyBuilderCollection } from '../wrappers/token/ToyBuilderCollection';
import { ToyBuilderItem } from '../wrappers/token/ToyBuilderItem';
import { ToygerCollection } from '../wrappers/token/ToygerCollection';
import { ToygerItem } from '../wrappers/token/ToygerItem';
import '@ton/test-utils';

interface DeployedContracts {
    toyBuilderCollection: SandboxContract<ToyBuilderCollection>;
    toyBuilderItem: SandboxContract<ToyBuilderItem>;
    toygerCollection: SandboxContract<ToygerCollection>;
    toygerMinter: SandboxContract<ToygerMinter>;
}

interface ToyBuilderConfig {
    collectionUrl: string;
    itemUrl: string;
    itemId: bigint;
    generation: bigint;
    serie: bigint;
    buildCredits: bigint;
    buildTime: bigint;
}

interface ToygerConfig {
    collectionUrl: string;
    serie: bigint;
    serieUrl: string;
    startIndex: bigint;
    numOfItems: bigint;
}

const TOYBUILDER_CONFIG: ToyBuilderConfig = {
    collectionUrl: 'ipfs://<cid_collection>/',
    itemUrl: 'ipfs://<cid_item>/',
    itemId: 0n,
    generation: 1n,
    serie: 1n,
    buildCredits: 5n,
    buildTime: 345600n // 4 days
}

const TOYGER_ITEM_ID = 0n;

const TOYGER_CONFIG: ToygerConfig = {
    collectionUrl: 'ipfs://<cid_collection>/',
    serieUrl: 'ipfs://<cid_item>/',
    serie: 1n,
    startIndex: 0n,
    numOfItems: 100n
}

const formatOffchainContent = (url: string): Cell => {
    return beginCell()
        .storeUint(1, 32)
        .storeStringTail(url)
    .endCell();
}

const formatToyBuilderSetupPayload = (
    generation: bigint,
    SERIE: bigint,
    buildCredits: bigint,
    buildTime: bigint,
    url: string,
    authority?: Address
): Cell => {
    const setupPayload = beginCell()
        .storeUint(generation, 8)
        .storeUint(SERIE, 8)
        .storeUint(buildCredits, 8)
        .storeUint(buildTime, 32)
        .storeStringRefTail(url);
    if (authority) {
        setupPayload.storeAddress(authority);
    }

    return setupPayload.endCell();
}  

async function setupSystem(
    blockchain: Blockchain,
    deployer: SandboxContract<TreasuryContract>,
    toyBuilderConfig: ToyBuilderConfig,
    toygerConfig: ToygerConfig
): Promise<DeployedContracts> {
    const toyBuilderCollection = blockchain.openContract(
        await ToyBuilderCollection.fromInit(
            formatOffchainContent(toyBuilderConfig.collectionUrl)
        )
    );

    await toyBuilderCollection.send(
        deployer.getSender(),
        {
            value: toNano('0.1')
        },
        {
            $$type: 'DeployCollection',
            queryId: 0n,
            owner: deployer.address,
            minter: deployer.address
        }
    )

    const toyBuilderItem = blockchain.openContract(
        ToyBuilderItem.fromAddress(
            await toyBuilderCollection.getGetNftAddressByIndex(toyBuilderConfig.itemId)
        )
    );

    await toyBuilderCollection.send(
        deployer.getSender(),
        {
            value: toNano('0.12')
        },
        {
            $$type: 'Mint',
            queryId: 0n,
            index: toyBuilderConfig.itemId,
            owner: deployer.address,
            responseDestination: deployer.address,
            customPayload: formatToyBuilderSetupPayload(
                toyBuilderConfig.generation,
                toyBuilderConfig.serie,
                toyBuilderConfig.buildCredits,
                toyBuilderConfig.buildTime,
                toyBuilderConfig.itemUrl
            )
        }
    );

    const toygerCollection = blockchain.openContract(
        await ToygerCollection.fromInit(
            formatOffchainContent(toygerConfig.collectionUrl)
        )
    );

    const toygerMinter = blockchain.openContract(
        await ToygerMinter.fromInit(
            toygerCollection.address,
            toyBuilderCollection.address,
            toygerConfig.serie,
            toygerConfig.startIndex,
            toygerConfig.numOfItems,
            beginCell()
                .storeStringRefTail(toygerConfig.serieUrl)
            .endCell()
        )
    );

    const receipt = await toygerMinter.send(
        deployer.getSender(),
        {
            value: toNano('0.1')
        },
        {
            $$type: 'DeployMinter',
            queryId: 0n,
            owner: deployer.address
        }
    );

    await toygerCollection.send(
        deployer.getSender(),
        {
            value: toNano('0.1')
        },
        {
            $$type: 'DeployCollection',
            queryId: 0n,
            owner: deployer.address,
            minter: toygerMinter.address
        }
    );

    return {
        toyBuilderCollection,
        toyBuilderItem,
        toygerCollection,
        toygerMinter
    };
}

describe('Toyger Minter Integration', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let toyBuilderCollection: SandboxContract<ToyBuilderCollection>;
    let toyBuilderItem: SandboxContract<ToyBuilderItem>;
    let toygerMinter: SandboxContract<ToygerMinter>;
    let toygerCollection: SandboxContract<ToygerCollection>;
    let toygerItem: SandboxContract<ToygerItem>;

    beforeAll(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        ({
            toyBuilderCollection,
            toyBuilderItem,
            toygerCollection,
            toygerMinter
        } = await setupSystem(
            blockchain,
            deployer,
            TOYBUILDER_CONFIG,
            TOYGER_CONFIG
        ));

        toygerItem = blockchain.openContract(
            ToygerItem.fromAddress(await toygerCollection.getGetNftAddressByIndex(TOYGER_ITEM_ID))
        );
    });

    it('Check mint data', async () => {});
    it('MintToyger (FAIL): if sender is not ToyBuilder, revert with "Only ToyBuilder" message', async () => {});
    it('MintToyger (FAIL): if paused, revert with "Paused" message', async () => {});
    it('MintToyger (FAIL): if toygerId is out-of-bounds, revert with "Invalid toyger ID" message', async () => {});
    it('MintToyger (SUCCESS): Should deploy Toyger and start build clock', async () => {});
});