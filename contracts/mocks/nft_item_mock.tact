import "../token/traits/nft/item";

contract NftItemMock with NftItem {

    // Storage

    isInitialized: Bool = false;
    index: Int as uint256;
    collection: Address;
    owner: Address;
    content: Cell;

    init(collection: Address, index: Int) {
        self.collection = collection;
        self.index = index;
        self.owner = newAddress(0, 0);
        self.content = emptyCell();
    }

    override inline fun getIndividualContent(): Cell {
        return self.content;
    }

    override inline fun setupCustom(msg: Setup) {
        self.content = msg.customPayload!!;
    }
}