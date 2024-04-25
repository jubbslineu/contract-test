import { Blockchain, SandboxContract, TreasuryContract, BlockchainSnapshot, EventMessageSent } from '@ton/sandbox';
import { beginCell, toNano } from '@ton/core';
import { NftCollectionMock } from '../wrappers/mocks/NftCollectionMock';
import { NftCollectionRoyaltyMock } from '../wrappers/mocks/NftCollectionRoyaltyMock';
import { NftItemMock } from '../wrappers/mocks/NftItemMock';
import { packTokenContent, unpackTokenContent } from '../scripts/common/utils'
import '@ton/test-utils';

const MIN_TONS_FOR_STORAGE = toNano('0.03');
const IS_SEQUENTIAL = false;
const COLLECTION_CONTENT = {
    name: 'Test NFT Collection'
};
const NFT_ITEM_INDIVIDUAL_CONTENT = beginCell()
    .storeUint(0, 8)
    .storeStringTail('item-uri')
.endCell();

function buildNftContent(index: bigint) {
    return beginCell()
        .storeUint(0, 8)
        .storeStringTail("https://base-url/")
        .storeStringTail(NFT_ITEM_INDIVIDUAL_CONTENT.beginParse().loadStringTail())
        .storeStringTail("/")
        .storeStringTail(index.toString())
    .endCell();
}

describe('Standard NFT Collection', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let nftCollection: SandboxContract<NftCollectionMock>;

    const snapStates = new Map<string, BlockchainSnapshot>;

    let loadSnapshot: (name: string) => void;

    beforeAll(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        nftCollection = blockchain.openContract(await NftCollectionMock.fromInit(
            packTokenContent(COLLECTION_CONTENT),
            IS_SEQUENTIAL
        ));

        loadSnapshot = (name) => {
            const snapshot = snapStates.get(name);
            if (!snapshot) {
                throw new Error('Snapshot does not exist');
            }
            blockchain.loadFrom(snapshot);
        };
    });

    it('Should revert with "Not enough TON" message', async () => {
        snapStates.set('beforeDeploying', blockchain.snapshot());
        const deployResult = await nftCollection.send(
            deployer.getSender(),
            {
                value: toNano('0.01')
            },
            {
                $$type: 'DeployCollection',
                queryId: 0n,
                owner: deployer.address,
                minter: deployer.address
            }
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            deploy: true,
            success: false,
            exitCode: 15304
        });

        loadSnapshot('beforeDeploying');
    });

    it('Should deploy', async () => {
        const deployResult = await nftCollection.send(
            deployer.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'DeployCollection',
                queryId: 0n,
                owner: deployer.address,
                minter: deployer.address
            }
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            deploy: true,
            success: true,
        });

        expect((await blockchain.getContract(nftCollection.address)).balance).toEqual(MIN_TONS_FOR_STORAGE);
    });

    it('Should revert with "Already deployed" message', async () => {
        const deployResult = await nftCollection.send(
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
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            success: false,
            exitCode: 24123
        });
    });

    it('Check collection data', async () => {
        const collectionData = await nftCollection.getGetCollectionData();

        expect(collectionData.nextItemIndex).toEqual(IS_SEQUENTIAL ? 0n : -1n);
        expect(collectionData.ownerAddress).toEqualAddress(deployer.address);

        const unpackedContentResult = unpackTokenContent(collectionData.collectionContent, ['name']);

        expect(unpackedContentResult.isRemainderEmpty).toBeTruthy();
        expect(unpackedContentResult.content).toEqual(COLLECTION_CONTENT);

        expect(await nftCollection.getGetMinter()).toEqualAddress(deployer.address);
    });

    it('Should change minter', async () => {
        snapStates.set('beforeChangeMinter', blockchain.snapshot());

        const newMinter = await blockchain.treasury('minter');
        await nftCollection.send(
            deployer.getSender(),
            {
                value: toNano('0.02')
            },
            {
                $$type: 'ChangeMinter',
                queryId: 0n,
                minter: newMinter.address
            }
        );

        expect(await nftCollection.getGetMinter()).toEqualAddress(newMinter.address);

        loadSnapshot('beforeChangeMinter');
    });

    describe('Deploy NFT item', () => {
        let nftOwner: SandboxContract<TreasuryContract>;
        let nftItem: SandboxContract<NftItemMock>;

        beforeAll(async () => {
            nftOwner = await blockchain.treasury('nftOwner');

            nftItem = blockchain.openContract(await NftItemMock.fromAddress(
                await nftCollection.getGetNftAddressByIndex(0n)
            ));
        });

        it('Should revert with "Not minter"', async () => {
            const deployResult = await nftCollection.send(
                nftOwner.getSender(),
                {
                    value: toNano('0.1')
                },
                {
                    $$type: 'Mint',
                    queryId: 0n,
                    index: 0n,
                    owner: nftOwner.address,
                    responseDestination: deployer.address,
                    customPayload: NFT_ITEM_INDIVIDUAL_CONTENT,
                }
            );

            expect(deployResult.transactions).toHaveTransaction({
                from: nftOwner.address,
                to: nftCollection.address,
                success: false,
                exitCode: 61597
            });
        });

        it('Should revert with "Not Enough TON for Mint"', async () => {
            const deployResult = await nftCollection.send(
                deployer.getSender(),
                {
                    value: toNano('0.05')
                },
                {
                    $$type: 'Mint',
                    queryId: 0n,
                    index: 0n,
                    owner: nftOwner.address,
                    responseDestination: deployer.address,
                    customPayload: beginCell().endCell(),
                }
            );

            expect(deployResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: nftCollection.address,
                success: false,
                exitCode: 45600
            });
        });

        describe('Standard NFT Item', () => {
            it('Should revert with "Only collection" message', async () => {
                snapStates.set('beforeDeploying', blockchain.snapshot());
    
                const nftItemTest = blockchain.openContract(await NftItemMock.fromInit(
                    nftCollection.address,
                    0n
                ));
    
                const deployResult = await nftItemTest.send(
                    deployer.getSender(),
                    {
                        value: toNano('0.01')
                    },
                    {
                        $$type: 'Setup',
                        queryId: 0n,
                        owner: nftOwner.address,
                        responseDestination: deployer.address,
                        customPayload: NFT_ITEM_INDIVIDUAL_CONTENT,
                    }
                );
    
                expect(deployResult.transactions).toHaveTransaction({
                    from: deployer.address,
                    to: nftItemTest.address,
                    deploy: true,
                    success: false,
                    exitCode: 17639
                });

                loadSnapshot('beforeDeploying');
            });
    
            it('Should Mint NFT', async () => {
                const deployResult = await nftCollection.send(
                    deployer.getSender(),
                    {
                        value: toNano('0.12')
                    },
                    {
                        $$type: 'Mint',
                        queryId: 0n,
                        index: 0n,
                        owner: nftOwner.address,
                        responseDestination: deployer.address,
                        customPayload: NFT_ITEM_INDIVIDUAL_CONTENT
                    }
                );
    
                expect(deployResult.transactions).toHaveTransaction({
                    from: nftCollection.address,
                    to: nftItem.address,
                    deploy: true,
                    success: true
                });
    
                const nftData = await nftItem.getGetNftData();
    
                expect(nftData.isInitialized).toBeTruthy();
                expect(nftData.index).toEqual(0n);
                expect(nftData.collectionAddress).toEqualAddress(nftCollection.address);
                expect(nftData.individualContent).toEqualCell(NFT_ITEM_INDIVIDUAL_CONTENT);
                expect(nftData.ownerAddress).toEqualAddress(nftOwner.address);
                expect(await nftItem.getGetStorageFee()).toEqual(0n);
            });

            it('Should reply with "MintFailed" message when NFT already minted', async () => {
                const receipt = await nftCollection.send(
                    deployer.getSender(),
                    {
                        value: toNano('0.12')
                    },
                    {
                        $$type: 'Mint',
                        queryId: 0n,
                        index: 0n,
                        owner: nftOwner.address,
                        responseDestination: deployer.address,
                        customPayload: NFT_ITEM_INDIVIDUAL_CONTENT,
                    }
                );

                const mintFailedBody = (<EventMessageSent>receipt.events.at(-1)).body;

                expect(mintFailedBody).toEqualCell(beginCell()
                    .storeUint(0xde51cffa, 32)
                    .storeUint(0n, 64)
                    .storeUint(0n, 256)
                    .storeAddress(nftOwner.address)
                .endCell());
            });
    
            it('Should get static data', async () => {
                const receipt = await nftItem.send(
                    deployer.getSender(),
                    {
                        value: toNano('0.02')
                    },
                    {
                        $$type: 'GetStaticData',
                        queryId: 0n
                    }
                );
    
                expect((<EventMessageSent>receipt.events.at(-1)).body).toEqualCell(beginCell()
                    .storeUint(0x8b771735, 32)
                    .storeUint(0n, 64)
                    .storeUint(0, 256)
                    .storeAddress(nftCollection.address)
                .endCell());
            });
    
            it('Should revert with "Only owner" message', async () => {
                // Create receiver
                const receiver = await blockchain.treasury('receiver');
    
                const receipt = await nftItem.send(
                    deployer.getSender(),
                    {
                        value: toNano('0.02')
                    },
                    {
                        $$type: 'Transfer',
                        queryId: 0n,
                        newOwner: receiver.address,
                        responseDestination: nftOwner.address,
                        customPayload: beginCell().endCell(),
                        forwardAmount: 0n,
                        forwardPayload: beginCell().endCell()
                    }
                );
    
                expect(receipt.transactions).toHaveTransaction({
                    from: deployer.address,
                    to: nftItem.address,
                    success: false,
                    exitCode: 35499
                });
            });
    
            it('Should revert with "Not enough TON" message', async () => {
                // Create receiver
                const receiver = await blockchain.treasury('receiver');
    
                const receipt = await nftItem.send(
                    nftOwner.getSender(),
                    {
                        value: toNano('0.01')
                    },
                    {
                        $$type: 'Transfer',
                        queryId: 0n,
                        newOwner: receiver.address,
                        responseDestination: nftOwner.address,
                        customPayload: beginCell().endCell(),
                        forwardAmount: 0n,
                        forwardPayload: beginCell().endCell()
                    }
                );
    
                expect(receipt.transactions).toHaveTransaction({
                    from: nftOwner.address,
                    to: nftItem.address,
                    success: false,
                    exitCode: 15304
                });
            });
    
            it('Should transfer', async () => {
                // Create receiver
                const receiver = await blockchain.treasury('receiver');
    
                await nftItem.send(
                    nftOwner.getSender(),
                    {
                        value: toNano('0.02')
                    },
                    {
                        $$type: 'Transfer',
                        queryId: 0n,
                        newOwner: receiver.address,
                        responseDestination: nftOwner.address,
                        customPayload: beginCell().endCell(),
                        forwardAmount: 0n,
                        forwardPayload: beginCell().endCell()
                    }
                );
    
                expect(await nftItem.getGetOwner()).toEqualAddress(receiver.address);
    
                await nftItem.send(
                    receiver.getSender(),
                    {
                        value: toNano('0.02')
                    },
                    {
                        $$type: 'Transfer',
                        queryId: 0n,
                        newOwner: nftOwner.address,
                        responseDestination: receiver.address,
                        customPayload: beginCell().endCell(),
                        forwardAmount: 0n,
                        forwardPayload: beginCell().endCell()
                    }
                );
    
                expect(await nftItem.getGetOwner()).toEqualAddress(nftOwner.address);
            });
    
            it('Should return correct NFT content', async () => {
                const nftData = await nftItem.getGetNftData();
    
                const nftContent = await nftCollection.getGetNftContent(nftData.index, nftData.individualContent);
    
                expect(nftContent).toEqualCell(buildNftContent(nftData.index));
            });
        });  
    });

    describe('Standard NFT Collection with Royalties', () => {
        const NUMERATOR = 10n;
        const DENOMINATOR = 100n;

        let nftCollectionRoyalty: SandboxContract<NftCollectionRoyaltyMock>;

        beforeAll(async () => {
            nftCollectionRoyalty = blockchain.openContract(await NftCollectionRoyaltyMock.fromInit(
                packTokenContent(COLLECTION_CONTENT),
                true
            ));

            await nftCollectionRoyalty.send(
                deployer.getSender(),
                {
                    value: toNano('0.05')
                },
                {
                    $$type: 'DeployCollection',
                    queryId: 0n,
                    owner: deployer.address,
                    minter: deployer.address
                }
            );
        });

        it('Should setup royalty fees', async () => {
            await nftCollectionRoyalty.send(
                deployer.getSender(),
                {
                    value: toNano('0.05')
                },
                {
                    $$type: 'ConfigRoyalty',
                    queryId: 0n,
                    numerator: NUMERATOR,
                    denominator: DENOMINATOR
                }
            );

            const royaltyParams = await nftCollectionRoyalty.getRoyaltyParams();

            expect(royaltyParams.numerator).toEqual(NUMERATOR);
            expect(royaltyParams.denominator).toEqual(DENOMINATOR);
        });

        it('Should change royalty destination', async () => {
            await nftCollectionRoyalty.send(
                deployer.getSender(),
                {
                    value: toNano('0.05')
                },
                {
                    $$type: 'ChangeRoyaltyDestination',
                    queryId: 0n,
                    destination: deployer.address
                }
            );

            const royaltyParams = await nftCollectionRoyalty.getRoyaltyParams();

            expect(royaltyParams.destination).toEqualAddress(deployer.address);
        });

        it('Send GetRoyaltyParams message', async () => {
            const receipt = await nftCollectionRoyalty.send(
                deployer.getSender(),
                {
                    value: toNano('0.02')
                },
                {
                    $$type: 'GetRoyaltyParams',
                    queryId: 0n
                }
            );

            const responseEventBody = (<EventMessageSent>receipt.events.at(-1)).body;
            const reportRoyaltyParamsSlice = responseEventBody.beginParse();

            expect(reportRoyaltyParamsSlice.loadUintBig(32)).toEqual(0xa8cb00adn);
            expect(reportRoyaltyParamsSlice.loadUintBig(64)).toEqual(0n);
            expect(reportRoyaltyParamsSlice.loadUintBig(16)).toEqual(NUMERATOR);
            expect(reportRoyaltyParamsSlice.loadUintBig(16)).toEqual(DENOMINATOR);
            expect(reportRoyaltyParamsSlice.loadAddress()).toEqualAddress(deployer.address);
        });
    });
});