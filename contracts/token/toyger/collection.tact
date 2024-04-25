import "../traits/nft/collection";
import "./item";

message(0) OnchainNftContent {
    data: map<Int as uint256, Cell>;
}

contract ToygerCollection with NftCollection, NftRoyaltiesExtension {
    const SETUP_SLICE_BITS: Int = 40;

    // Storage

    nextItemIndex: Int as int256;
    collectionContent: Cell;
    owner: Address;
    minter: Address;
    royaltyNumerator: Int as uint16;
    royaltyDenominator: Int as uint16;
    royaltyDestination: Address;


    init(collectionContent: Cell) {
        self.owner = newAddress(0, 0);
        self.minter = newAddress(0, 0);
        self.collectionContent = collectionContent;
        self.nextItemIndex = -1; // Non-sequential
        self.royaltyNumerator = 0;
        self.royaltyDenominator = 0;
        self.royaltyDestination = newAddress(0, 0);
    }

    // Access

    override inline fun requireForMint(msg: Mint) {
        require(sender() == self.minter, "Not minter");
        let ctx: Context = context();

        require(ctx.value >= self.MINT_FEE, "Not enough TON for Mint");

        let customPayloadSlice: Slice = (msg.customPayload!!).asSlice();
        require(
            customPayloadSlice.bits() >= self.SETUP_SLICE_BITS &&
            !customPayloadSlice.refsEmpty(),
            "Setup data missing"
        );

        customPayloadSlice.loadUint(8);
        require(
            customPayloadSlice.preloadUint(16) >= 1 &&
            customPayloadSlice.loadUint(16) <= customPayloadSlice.loadUint(16),
            "Invalid params"
        );
    }

    // Methods

    override inline fun getNftStateInit(collectionAddress: Address, index: Int): StateInit {
        return initOf ToygerItem(collectionAddress, index);
    }

    override inline fun getNftContent(index: Int, individualContent: Cell): Cell {
        let contentSlice: Slice = individualContent.beginParse();
        let content: map<Int as uint256, Cell> = emptyMap();

        let toygerName: StringBuilder = beginTailString();
        toygerName.append("Toyger Serie ");
        toygerName.append(contentSlice.loadUint(8).toString());
        toygerName.append(" Unit ");
        toygerName.append(contentSlice.loadUint(16).toString());
        toygerName.append("/");
        toygerName.append(contentSlice.loadUint(16).toString());
        content.set(sha256("name"), toygerName.toCell());

        let toygerUrl: StringBuilder = beginTailString();
        toygerUrl.append(contentSlice.loadRef().asSlice().asString());
        content.set(sha256("url"), toygerUrl.toCell());

        return OnchainNftContent{ data: content }.toCell();
    }
}