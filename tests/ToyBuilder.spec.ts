import { Blockchain, SandboxContract, TreasuryContract, BlockchainSnapshot, EventMessageSent } from '@ton/sandbox';
import { beginCell, toNano, Cell, Address  } from '@ton/core';
import { ToyBuilderCollection } from '../wrappers/token/ToyBuilderCollection';
import { ToyBuilderItem } from '../wrappers/token/ToyBuilderItem';
import { ToygerMinterMock } from '../wrappers/mocks/ToygerMinterMock';
import { ToygerMock } from '../wrappers/mocks/ToygerMock';
import '@ton/test-utils';


const COLLECTION_URL = 'ipfs://<cid_collection>/';
const ITEM_URL = 'ipfs://<cid_item>/';
const ITEM_ID = 0n;

const GENERATION = 1n;
const SERIE = 1n;
const BUILD_CREDITS = 5n;
const BUILD_TIME = 345600n; // 4 days


const formatOffchainContent = (url: string): Cell => {
    return beginCell()
        .storeUint(1, 32)
        .storeStringTail(url)
    .endCell();
}

const formatSetupPayload = (
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

describe('ToyBuilder Collection & Item', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let toyBuilderCollection: SandboxContract<ToyBuilderCollection>;
    let toyBuilderItem: SandboxContract<ToyBuilderItem>;

    const snapStates = new Map<string, BlockchainSnapshot>;

    let getCurTime: () => number;
    let advanceTime: (time: number) => void;
    let loadSnapshot: (name: string) => void;

    beforeAll(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        toyBuilderCollection = blockchain.openContract(await ToyBuilderCollection.fromInit(
            formatOffchainContent(COLLECTION_URL)
        ));

        await toyBuilderCollection.send(
            deployer.getSender(),
            {
                value: toNano('1')
            },
            {
                $$type: 'DeployCollection',
                queryId: 0n,
                owner: deployer.address,
                minter: deployer.address
            }
        );

        toyBuilderItem = blockchain.openContract(ToyBuilderItem.fromAddress(
            await toyBuilderCollection.getGetNftAddressByIndex(ITEM_ID)
        ));

        getCurTime = () => blockchain.now ?? Math.floor(Date.now() / 1000);
        advanceTime = (time: number) => {
            blockchain.now ?? (blockchain.now = getCurTime());
            blockchain.now += time;
        };
        loadSnapshot = (name) => {
            const snapshot = snapStates.get(name);
            if (!snapshot) {
                throw new Error('Snapshot does not exist');
            }
            blockchain.loadFrom(snapshot);
        };
    });

    describe('Toybuilder Collection', () => {
        it('Check collection content', async () => {
            const collectionContent = (await toyBuilderCollection.getGetCollectionData()).collectionContent;
    
            expect(collectionContent).toEqualCell(formatOffchainContent(COLLECTION_URL));
        });

        it('Mint (FAIL): Invalid customPayload should revert with "Setup data missing"', async () => {
            const receipt = await toyBuilderCollection.send(
                deployer.getSender(),
                {
                    value: toNano('1')
                },
                {
                    $$type: 'Mint',
                    queryId: 0n,
                    index: ITEM_ID,
                    owner: deployer.address,
                    responseDestination: deployer.address,
                    customPayload: beginCell().endCell()
                }
            );

            expect(receipt.transactions).toHaveTransaction({
                from: deployer.address,
                to: toyBuilderCollection.address,
                success: false,
                exitCode: 46719
            });
        });
    
        it('Mint (SUCCESS): Should deploy ToyBuilder with correct params', async () => {
            const deployTx = await toyBuilderCollection.send(
                deployer.getSender(),
                {
                    value: toNano('1')
                },
                {
                    $$type: 'Mint',
                    queryId: 0n,
                    index: ITEM_ID,
                    owner: deployer.address,
                    responseDestination: deployer.address,
                    customPayload: formatSetupPayload(
                        GENERATION,
                        SERIE,
                        BUILD_CREDITS,
                        BUILD_TIME,
                        ITEM_URL,
                        deployer.address
                    )
                }
            );
    
            expect(deployTx.transactions).toHaveTransaction({
                from: toyBuilderCollection.address,
                to: toyBuilderItem.address,
                success: true,
                deploy: true
            });
        });
    });

    it('Check NFT Content', async () => {
        const { individualContent, index } = await toyBuilderItem.getGetNftData();

        const nftContent = await toyBuilderCollection.getGetNftContent(index, individualContent);

        expect(nftContent).toEqualCell(beginCell()
            .storeUint(1, 32)
            .storeStringTail(ITEM_URL)
        .endCell());
    });

    describe('ToyBuilder Item', () => {
        let toygerMinterMock: SandboxContract<ToygerMinterMock>;
        let toygerMock: SandboxContract<ToygerMock>;

        beforeAll(async () => {
            toygerMinterMock = blockchain.openContract(
                await ToygerMinterMock.fromInit(toyBuilderCollection.address)
            );
            toygerMock = blockchain.openContract(
                await ToygerMock.fromInit(toyBuilderItem.address)
            );

            await toygerMinterMock.send(
                deployer.getSender(),
                {
                    value: toNano('0.05')
                },
                {
                    $$type: 'Deploy',
                    queryId: 0n
                }
            );

            await toygerMinterMock.send(
                deployer.getSender(),
                {
                    value: toNano('0.05')
                },
                {
                    $$type: 'MockToygerAddress',
                    queryId: 0n,
                    toygerAddress: toygerMock.address
                }
            );
        });

        it('Check ToyBuilder Item Metadata (post-deployment)', async () => {
            const toyBuilderNftData = await toyBuilderItem.getGetNftData();
    
            expect(await toyBuilderItem.getGetOwner()).toEqualAddress(deployer.address);
            expect(toyBuilderNftData.collectionAddress).toEqualAddress(toyBuilderCollection.address);
            expect(toyBuilderNftData.index).toEqual(ITEM_ID);
            expect(toyBuilderNftData.isInitialized).toBeTruthy();
            expect(toyBuilderNftData.individualContent).toEqualCell(beginCell()
                .storeUint(GENERATION, 8)
                .storeUint(SERIE, 8)
                .storeUint(BUILD_CREDITS, 8)
                .storeUint(BUILD_TIME, 32)
                .storeUint(0n, 64)
                .storeAddress(null)
                .storeStringRefTail(ITEM_URL)
            .endCell());
    
            expect(await toyBuilderItem.getGetAuthorityAddress()).toEqualAddress(deployer.address);
    
            const toyBuilderData = await toyBuilderItem.getGetToybuilderData();
    
            expect(toyBuilderData.generation).toEqual(GENERATION);
            expect(toyBuilderData.serie).toEqual(SERIE);
            expect(toyBuilderData.buildCredits).toEqual(BUILD_CREDITS);
            expect(toyBuilderData.buildTime).toEqual(BUILD_TIME);
            expect(toyBuilderData.buildStart).toEqual(0n);
            expect(toyBuilderData.awaitingResponseFrom).toBeNull();
        });

        it('BuildToyger (FAIL): If revoked should revert with "Revoked"', async () => {
            snapStates.set('beforeRevoke', blockchain.snapshot());
            
            await toyBuilderItem.send(
                deployer.getSender(),
                {
                    value: toNano('0.05')
                },
                {
                    $$type: 'Revoke',
                    queryId: 0n
                }
            );

            const receipt = await toyBuilderItem.send(
                deployer.getSender(),
                {
                    value: toNano('0.05')
                },
                {
                    $$type: 'BuildToyger',
                    queryId: 0n,
                    itemId: 0n,
                    toygerMinter: toyBuilderCollection.address
                }
            );

            expect(receipt.transactions).toHaveTransaction({
                from: deployer.address,
                to: toyBuilderItem.address,
                success: false,
                exitCode: 14072
            });
        });

        it('ClaimToyger (FAIL): If revoked should revert with "Revoked"', async () => {
            const receipt = await toyBuilderItem.send(
                deployer.getSender(),
                {
                    value: toNano('0.05')
                },
                {
                    $$type: 'ClaimToyger',
                    queryId: 0n
                }
            );

            expect(receipt.transactions).toHaveTransaction({
                from: deployer.address,
                to: toyBuilderItem.address,
                success: false,
                exitCode: 14072
            });

            loadSnapshot('beforeRevoke');
        });

        it('BuildToyger (FAIL): If sender is not owner should revert with "Only Owner"', async () => {
            const notOwner = await blockchain.treasury('notOwner');

            const receipt = await toyBuilderItem.send(
                notOwner.getSender(),
                {
                    value: toNano('0.05')
                },
                {
                    $$type: 'BuildToyger',
                    queryId: 0n,
                    itemId: 0n,
                    toygerMinter: toyBuilderCollection.address
                }
            );

            expect(receipt.transactions).toHaveTransaction({
                from: notOwner.address,
                to: toyBuilderItem.address,
                success: false,
                exitCode: 35499
            });
        });

        it('ClaimToyger (FAIL): If sender is not the owner should revert with "Only owner"', async () => {
            const notOwner = await blockchain.treasury('notOwner');

            const receipt = await toyBuilderItem.send(
                notOwner.getSender(),
                {
                    value: toNano('0.05')
                },
                {
                    $$type: 'ClaimToyger',
                    queryId: 0n,
                }
            );

            expect(receipt.transactions).toHaveTransaction({
                from: notOwner.address,
                to: toyBuilderItem.address,
                success: false,
                exitCode: 35499
            });
        });

        it('ClaimToyger (FAIL): If buildStart is equal to zero should revert with "No toygers being built', async () => {
            const receipt = await toyBuilderItem.send(
                deployer.getSender(),
                {
                    value: toNano('0.05')
                },
                {
                    $$type: 'ClaimToyger',
                    queryId: 0n,
                }
            );

            expect(receipt.transactions).toHaveTransaction({
                from: deployer.address,
                to: toyBuilderItem.address,
                success: false,
                exitCode: 40157
            });
        });

        it('BuildToyger (SUCCESS) & MintToyger (FAIL): Should bounce with MintToygerFailed message', async () => {
            const receipt = await toyBuilderItem.send(
                deployer.getSender(),
                {
                    value: toNano('0.05')
                },
                {
                    $$type: 'BuildToyger',
                    queryId: 0n,
                    itemId: 0n,
                    toygerMinter: toyBuilderCollection.address
                }
            );
    
            expect(receipt.transactions).toHaveTransaction({
                from: toyBuilderItem.address,
                to: toyBuilderCollection.address,
                success: false
            });
    
            expect(receipt.transactions).toHaveTransaction({
                from: toyBuilderCollection.address,
                to: toyBuilderItem.address,
                inMessageBounced: true,
            });
    
            const mintToygerFailedMessage = (<EventMessageSent>receipt.events.at(-1)).body;
    
            expect(mintToygerFailedMessage).toEqualCell(beginCell()
                .storeUint(0x489ded90, 32)
                .storeUint(0n, 64)
            .endCell());

            expect((await toyBuilderItem.getGetToybuilderData()).awaitingResponseFrom).toBeNull();
        });

        it('BuildToyger (SUCCESS) & MintToyger (SUCCESS): Should start building Toyger', async () => {
            const receipt = await toyBuilderItem.send(
                deployer.getSender(),
                {
                    value: toNano('0.05')
                },
                {
                    $$type: 'BuildToyger',
                    queryId: 0n,
                    itemId: 0n,
                    toygerMinter: toygerMinterMock.address
                }
            );

            const mintToygerSuceededBody = (<EventMessageSent>receipt.events.at(-2)).body;

            expect(mintToygerSuceededBody).toEqualCell(beginCell()
                .storeUint(0xa1f22cc8, 32)
                .storeUint(0n, 64)
                .storeAddress(toygerMock.address)
            .endCell());

            const toyBuilderData = await toyBuilderItem.getGetToybuilderData();

            expect(toyBuilderData.awaitingResponseFrom).toEqualAddress(toygerMock.address);
            expect(toyBuilderData.buildCredits).toEqual(BUILD_CREDITS);
            expect(toyBuilderData.buildStart).toBeGreaterThan(0n);
            expect(toyBuilderData.buildTime).toEqual(BUILD_TIME);
        });
    });
});