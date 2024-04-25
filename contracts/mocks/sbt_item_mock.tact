import "../token/traits/sbt/item";

contract SbtItemMock with SbtItem {

    // Storage

    isInitialized: Bool = false;
    index: Int as uint256;
    collection: Address;
    owner: Address;
    authority: Address;
    revokedAt: Int as uint64 = 0;
    content: Cell;

    init(collection: Address, index: Int) {
        self.collection = collection;
        self.index = index;
        self.owner = newAddress(0, 0);
        self.authority = collection;
        self.content = emptyCell();
    }

    override inline fun getIndividualContent(): Cell {
        return self.content;
    }

    override inline fun setupCustom(msg: Setup) {
        self.content = msg.customPayload!!;
    }
}