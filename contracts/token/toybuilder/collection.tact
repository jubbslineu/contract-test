import "../traits/sbt/collection";
import "./item";

message(1) OffchainNftContent {
    url: Slice as remaining;
}

contract ToyBuilderCollection with SbtCollection {
    const SETUP_SLICE_BITS: Int = 56;

    // Storage

    nextItemIndex: Int as int256;
    collectionContent: Cell;
    owner: Address;
    minter: Address;

    init(collectionContent: Cell) {
        self.owner = newAddress(0, 0);
        self.minter = newAddress(0, 0);
        self.collectionContent = collectionContent;
        self.nextItemIndex = 0; // sequential
    }

    // Access

    override inline fun requireForMint(msg: Mint) {
        require(sender() == self.minter, "Not minter");
        let ctx: Context = context();

        require(ctx.value >= 2 * ctx.readForwardFee() + self.MIN_TONS_FOR_NFT + self.MINT_FEE, "Not enought TON for Mint");

        let customPayloadSlice: Slice = (msg.customPayload!!).asSlice();
        require(
            customPayloadSlice.bits() >= self.SETUP_SLICE_BITS &&
            !customPayloadSlice.refsEmpty(),
            "Setup data missing"
        );
    }

    // Methods

    override inline fun getNftStateInit(collectionAddress: Address, index: Int): StateInit {
        return initOf ToyBuilderItem(collectionAddress, index);
    }

    override inline fun getNftContent(index: Int, individualContent: Cell): Cell {
        let contentSlice: Slice = individualContent.asSlice();

        return OffchainNftContent{ 
            url: contentSlice.loadRef().asSlice() 
        }.toCell();
    }
}