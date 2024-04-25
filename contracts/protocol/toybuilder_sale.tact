import "@stdlib/ownable";
import "../token/traits/sbt/messages";

message ChangeToyBuilderAuthority {
    queryId: Int as uint64;
    toyBuilderAddress: Address;
    newAuthority: Address;
}

message Purchase {
    queryId: Int as uint64;
    itemId: Int as uint256;
}

message PurchaseExtraMints {
    queryId: Int as uint64;
    addMints: Int as uint8;
    toyBuilderAddress: Address;
}

message RevokeToyBuilder {
    queryId: Int as uint64;
    toyBuilderAddress: Address;
}

struct SaleData {
    
}

contract ToyBuilderSale with OwnableTransferable {

    // Storage

    owner: Address;
    treasury: Address;
    minter: Address;
    saleData: SaleData;

    // Receivers

    receive(msg: Purchase) {
        // TODO: Implement sale logic

        require(msg.itemId < self.saleData.itemsForSale, "Item not for sale");

        send(SendParameters{
            to: self.minter,
            value: 0,
            mode: SendRemainingValue,
            bounce: true,
            body: Mint{
                queryId: msg.queryId,
                index: msg.itemId + self.saleData.itemIdOffset,
                responseAddress: sender()
            }.toCell()
        });
    }

    receive(msg: PurchaseExtraMints) {
        // TODO: Implement sale logic
        send(SendParameters{
            to: msg.toyBuilderAddress,
            value: 0,
            mode: SendRemainingValue,
            bounce: true,
            body: IncreaseMintLimit{
                queryId: msg.queryId,
                addMints: msg.addMints,
                responseAddress: sender()
            }.toCell()
        });
    }

    receive(msg: ChangeToyBuilderAuthority) {
        self.requireOwner();

        send(SendParameters{
            to: msg.toyBuilderAddress,
            value: 0,
            mode: SendRemainingValue,
            bounce: true,
            body: ChangeAuthority{
                queryId: msg.queryId,
                newAuthority: msg.newAuthority
            }.toCell()
        });
    }

    receive(msg: RevokeToyBuilder) {
        self.requireOwner();

        send(SendParameters{
            to: msg.toyBuilderAddress,
            value: 0,
            mode: SendRemainingValue,
            bounce: true,
            body: Revoke{ queryId: msg.queryId }.toCell()
        });
    }

    receive(msg: Excesses) {
        send(SendParameters{
            to: self.owner,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: msg.toCell()
        });
    }

    bounced(src: ChangeAuthority) {
        send(SendParameters{
            to: self.owner,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: ChangeSbtAuthorityFailed{ queryId: src.queryId }.toCell()
        });
    }

    bounced(src: Revoke) {
        send(SendParameters{
            to: self.owner,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: RevokeSbtFailed{ queryId: src.queryId }.toCell()
        });
    }

    // Methods

    fun isMinted(itemId: Int, flipBit: Bool): Bool {
        let index: Int = itemId / 1023;
        let bitOffset: Int = itemId % 1023;

        let indexBitmap: Cell? = self.saleData.bitmap.get(index);
        if (indexBitmap == null) {
            if (flipBit) self.markAsMinted(index, bitOffset, null);
            return false;
        }
        let indexBitmapSlice: Slice = indexBitmap.asSlice();
        if (indexBitmapSlice.bits <= bitOffset) {
            if (flipBit) self.markAsMinted(index, bitOffset, indexBitmapSlice);
            return false;
        }
        indexBitmapSlice.loadUint(bitOffset);

        let isMinted: Bool = indexBitmapSlice.loadUint(1) > 0;
        if (!isMinted && flipBit) {
            self.markAsMinted(index, bitOffset, indexBitmapSlice);
        }
        return isMinted;
    }

    fun markAsMinted(index: Int, bitOffset: Int, bitmapSlice: Slice?) {
        if (bitmapSlice == null) {
            self.saleData.bitmap.set(beginCell()
                .storeUint(0, bitOffset)
                .storeUint(1, 1)
            .endCell());
        } else {
            let padding: Int = bitOffset - bitmapSlice.bits;
            if (padding >= 0) {
                self.saleData.bitmap.set(beginCell()
                    .storeSlice(bitmapSlice)
                    .storeUint(0, padding)
                    .storeUint(1, 1)
                .endCell());
            } else {
                self.saleData.bitmap.set(beginCell()
                    .storeSlice(bitmapSlice.loadUint(bitOffset))
                    .storeUint(1, 1)
                    .storeSlice(bitmapSlice.loadUint(bitmapSlice.bits - 1))
                .endCell());
            }
        }
    }

    
}