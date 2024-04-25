import { Blockchain, SandboxContract, TreasuryContract, BlockchainSnapshot, EventMessageSent, Treasury } from '@ton/sandbox';
import { beginCell, toNano } from '@ton/core';
import { SbtCollectionMock } from '../wrappers/mocks/SbtCollectionMock';
import { SbtItemMock } from '../wrappers/mocks/SbtItemMock';
import { packTokenContent } from '../scripts/common/utils'
import '@ton/test-utils';

const COLLECTION_CONTENT = {
    name: 'Test SBT Collection'
};

const IS_SEQUENTIAL = true;

const NFT_ITEM_INDIVIDUAL_CONTENT = beginCell()
    .storeUint(0, 8)
    .storeStringTail('item-uri')
.endCell();

describe('Standard SBT collection & Item', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let sbtOwner: SandboxContract<TreasuryContract>;
    let sbtCollection: SandboxContract<SbtCollectionMock>;
    let sbtItem: SandboxContract<SbtItemMock>;

    const snapStates = new Map<string, BlockchainSnapshot>;

    let loadSnapshot: (name: string) => void;

    beforeAll(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');

        sbtCollection = blockchain.openContract(await SbtCollectionMock.fromInit(
            packTokenContent(COLLECTION_CONTENT),
            IS_SEQUENTIAL
        ));

        await sbtCollection.send(
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

        sbtOwner = await blockchain.treasury('sbtOwner');

        await sbtCollection.send(
            deployer.getSender(),
            {
                value: toNano('0.12')
            },
            {
                $$type: 'Mint',
                queryId: 0n,
                index: 0n,
                owner: sbtOwner.address,
                responseDestination: deployer.address,
                customPayload: NFT_ITEM_INDIVIDUAL_CONTENT
            }
        );

        sbtItem = blockchain.openContract(SbtItemMock.fromAddress(
            await sbtCollection.getGetNftAddressByIndex(0n)
        ));

        loadSnapshot = (name) => {
            const snapshot = snapStates.get(name);
            if (!snapshot) {
                throw new Error('Snapshot does not exist');
            }
            blockchain.loadFrom(snapshot);
        };

    });

    it('Check SBT Item data', async () => {
        expect(await sbtItem.getGetOwner()).toEqualAddress(sbtOwner.address);
        expect(await sbtItem.getGetAuthorityAddress()).toEqualAddress(sbtCollection.address);
        expect(await sbtItem.getGetRevokedTime()).toEqual(0n);
    });

    it('RevokeSbt (FAIL): Should fail if sender is not the owner', async () => {
        const notOwner = await blockchain.treasury('notOwner');

        const receipt = await sbtCollection.send(
            notOwner.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'RevokeSbt',
                queryId: 0n,
                itemId: 0n
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: notOwner.address,
            to: sbtCollection.address,
            success: false,
            exitCode: 132
        });
    });

    it('RevokeSbt (FAIL): Should fail if SBT doesn\'t exist', async () => {
        const receipt = await sbtCollection.send(
            deployer.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'RevokeSbt',
                queryId: 0n,
                itemId: 1n
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: deployer.address,
            to: sbtCollection.address,
            success: false,
            exitCode: 16954
        });
    });

    it('RevokeSbt & Revoke (SUCCESS): SBT Item revokedAt should be greater than zero', async () => {
        snapStates.set('beforeRevokeSbt', blockchain.snapshot());
        await sbtCollection.send(
            deployer.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'RevokeSbt',
                queryId: 0n,
                itemId: 0n
            }
        );

        expect(await sbtItem.getGetRevokedTime()).toBeGreaterThan(0n);
    });

    it('Revoke (FAIL): Should fail if already revoked', async () => {
        const receipt = await sbtCollection.send(
            deployer.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'RevokeSbt',
                queryId: 0n,
                itemId: 0n
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: sbtCollection.address,
            to: sbtItem.address,
            success: false,
            exitCode: 14072
        });

        loadSnapshot('beforeRevokeSbt');
    });

    it('Revoke (FAIL): Should fail if sender is not authority', async () => {
        const notAuthority = await blockchain.treasury('notAuthority');

        const receipt = await sbtItem.send(
            notAuthority.getSender(),
            {
                value: toNano('0.02')
            },
            {
                $$type: 'Revoke',
                queryId: 0n
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: notAuthority.address,
            to: sbtItem.address,
            success: false,
            exitCode: 32296
        });
    });

    it('Destroy (FAIL): Should fail if sender is not the owner', async () => {
        const notOwner = await blockchain.treasury('notOwner');

        const receipt = await sbtItem.send(
            notOwner.getSender(),
            {
                value: toNano('0.02')
            },
            {
                $$type: 'Destroy',
                queryId: 0n
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: notOwner.address,
            to: sbtItem.address,
            success: false,
            exitCode: 35499
        });
    });

    it('Destroy (SUCCESS): Should destroy SBT and send remaining balance to sender', async () => {
        snapStates.set('beforeDestroy', blockchain.snapshot());

        await sbtItem.send(
            sbtOwner.getSender(),
            {
                value: toNano('0.02')
            },
            {
                $$type: 'Destroy',
                queryId: 0n
            }
        );

        const sbtItemMetadata = await blockchain.getContract(sbtItem.address);
        expect(sbtItemMetadata.balance).toEqual(0n);
        expect(sbtItemMetadata.accountState).toBeUndefined();

        loadSnapshot('beforeDestroy');
    });

    it('ChangeAuthority (FAIL): Should fail if sender is not authority', async () => {
        const notAuthority = await blockchain.treasury('notAuthority');

        const receipt = await sbtItem.send(
            notAuthority.getSender(),
            {
                value: toNano('0.02')
            },
            {
                $$type: 'ChangeAuthority',
                queryId: 0n,
                newAuthority: notAuthority.address
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: notAuthority.address,
            to: sbtItem.address,
            success: false,
            exitCode: 32296
        });
    });

    it('ChangeSbtAuthority (FAIL): Should fail if sender is not the owner', async () => {
        const notOwner = await blockchain.treasury('notOwner');

        const receipt = await sbtCollection.send(
            notOwner.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'ChangeSbtAuthority',
                queryId: 0n,
                itemId: 0n,
                newAuthority: notOwner.address
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: notOwner.address,
            to: sbtCollection.address,
            success: false,
            exitCode: 132
        });
    });

    it('ChangeSbtAuthority (FAIL): Should fail if SBT doesnt\'t exist', async () => {
        const receipt = await sbtCollection.send(
            deployer.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'ChangeSbtAuthority',
                queryId: 0n,
                itemId: 1n,
                newAuthority: deployer.address
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: deployer.address,
            to: sbtCollection.address,
            success: false,
            exitCode: 16954
        });
    });

    it('ChangeSbtAuthority & ChangeAuthority (SUCCESS): Should change authority', async () => {
        snapStates.set('beforeChangeAuthority', blockchain.snapshot());

        const newAuthority = await blockchain.treasury('newAuthority');
        
        await sbtCollection.send(
            deployer.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'ChangeSbtAuthority',
                queryId: 0n,
                itemId: 0n,
                newAuthority: newAuthority.address
            }
        );

        expect(await sbtItem.getGetAuthorityAddress()).toEqualAddress(newAuthority.address);
    });

    it('ChangeSbtAuthority (SUCCESS) & ChangeAuthority (FAIL): Should bounce and reply with ChangeSbtAuthorityFailed messsage', async () => {
        const receipt = await sbtCollection.send(
            deployer.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'ChangeSbtAuthority',
                queryId: 0n,
                itemId: 0n,
                newAuthority: deployer.address
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: sbtCollection.address,
            to: sbtItem.address,
            success: false,
            exitCode: 32296,
        });

        expect(receipt.transactions).toHaveTransaction({
            from: sbtItem.address,
            to: sbtCollection.address,
            success: true,
            inMessageBounced: true
        });

        const changeSbtAuthorityFailed = (<EventMessageSent>receipt.events.at(-1)).body;

        expect(changeSbtAuthorityFailed).toEqualCell(beginCell()
            .storeUint(0x0b9642e0, 32)
            .storeUint(0n, 64)
        .endCell());
    });

    it('RevokeSbt (SUCCESS) & Revoke (FAIL): Should bounce and reply with RevokeSbtFailed message', async () => {
        const receipt = await sbtCollection.send(
            deployer.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'RevokeSbt',
                queryId: 0n,
                itemId: 0n,
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: sbtCollection.address,
            to: sbtItem.address,
            success: false,
            exitCode: 32296,
        });

        expect(receipt.transactions).toHaveTransaction({
            from: sbtItem.address,
            to: sbtCollection.address,
            success: true,
            inMessageBounced: true
        });

        const revokeSbtFailed = (<EventMessageSent>receipt.events.at(-1)).body;

        expect(revokeSbtFailed).toEqualCell(beginCell()
            .storeUint(0x616c9df9, 32)
            .storeUint(0n, 64)
        .endCell());

        loadSnapshot('beforeChangeAuthority');
    });

    it('ProveOwnership (FAIL): Should fail if sender is not the owner', async () => {
        const notOwner = await blockchain.treasury('notOwner');

        const receipt = await sbtItem.send(
            notOwner.getSender(),
            {
                value: toNano('0.02')
            },
            {
                $$type: 'ProveOwnership',
                queryId: 0n,
                dest: notOwner.address,
                forwardPayload: beginCell().endCell(),
                withContent: false
            }
        );

        expect(receipt.transactions).toHaveTransaction({
            from: notOwner.address,
            to: sbtItem.address,
            success: false,
            exitCode: 35499
        });
    });

    it('ProveOwnership (SUCCESS): Should receive OwnershipProof with no content', async () => {
        const receipt = await sbtItem.send(
            sbtOwner.getSender(),
            {
                value: toNano('0.02')
            },
            {
                $$type: 'ProveOwnership',
                queryId: 0n,
                dest: sbtOwner.address,
                forwardPayload: beginCell().endCell(),
                withContent: false
            }
        );

        const ownershipProof = (<EventMessageSent>receipt.events.at(-1)).body;
        expect(ownershipProof).toEqualCell(beginCell()
            .storeUint(0x0524c7ae, 32)
            .storeUint(0n, 64)
            .storeUint(0n, 256)
            .storeAddress(sbtOwner.address)
            .storeRef(beginCell().endCell())
            .storeUint(0n, 64)
            .storeMaybeRef(null)
        .endCell());
    });

    it('ProveOwnership (SUCCESS): Should receive OwnershipProof with content', async () => {
        const receipt = await sbtItem.send(
            sbtOwner.getSender(),
            {
                value: toNano('0.02')
            },
            {
                $$type: 'ProveOwnership',
                queryId: 0n,
                dest: sbtOwner.address,
                forwardPayload: beginCell().endCell(),
                withContent: true
            }
        );

        const ownershipProof = (<EventMessageSent>receipt.events.at(-1)).body;
        expect(ownershipProof).toEqualCell(beginCell()
            .storeUint(0x0524c7ae, 32)
            .storeUint(0n, 64)
            .storeUint(0n, 256)
            .storeAddress(sbtOwner.address)
            .storeRef(beginCell().endCell())
            .storeUint(0n, 64)
            .storeMaybeRef(NFT_ITEM_INDIVIDUAL_CONTENT)
        .endCell());
    });

    it('RequestOwner (SUCCESS): Should receive OwnerInfo without content', async () => {
        const receipt = await sbtItem.send(
            deployer.getSender(),
            {
                value: toNano('0.02')
            },
            {
                $$type: 'RequestOwner',
                queryId: 0n,
                dest: deployer.address,
                forwardPayload: beginCell().endCell(),
                withContent: false
            }
        );

        const ownerInfo = (<EventMessageSent>receipt.events.at(-1)).body;
        expect(ownerInfo).toEqualCell(beginCell()
            .storeUint(0x0dd607e3, 32)
            .storeUint(0n, 64)
            .storeUint(0n, 256)
            .storeAddress(deployer.address)
            .storeAddress(sbtOwner.address)
            .storeRef(beginCell().endCell())
            .storeUint(0n, 64)
            .storeMaybeRef(null)
        .endCell());
    });

    it('RequestOwner (SUCCESS): Should receive OwnerInfo without content', async () => {
        const receipt = await sbtItem.send(
            deployer.getSender(),
            {
                value: toNano('0.02')
            },
            {
                $$type: 'RequestOwner',
                queryId: 0n,
                dest: deployer.address,
                forwardPayload: beginCell().endCell(),
                withContent: true
            }
        );

        const ownerInfo = (<EventMessageSent>receipt.events.at(-1)).body;
        expect(ownerInfo).toEqualCell(beginCell()
            .storeUint(0x0dd607e3, 32)
            .storeUint(0n, 64)
            .storeUint(0n, 256)
            .storeAddress(deployer.address)
            .storeAddress(sbtOwner.address)
            .storeRef(beginCell().endCell())
            .storeUint(0n, 64)
            .storeMaybeRef(NFT_ITEM_INDIVIDUAL_CONTENT)
        .endCell());
    });
});