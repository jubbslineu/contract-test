import "../token/traits/sbt/collection.tact";
import "./sbt_item_mock";

contract SbtCollectionMock with SbtCollection {

    // Storage

    nextItemIndex: Int as int256;
    collectionContent: Cell;
    owner: Address;
    minter: Address;

    init(collectionContent: Cell, isSequential: Bool) {
        self.owner = newAddress(0, 0);
        self.minter = newAddress(0, 0);
        self.collectionContent = collectionContent;
        if (isSequential) {
            self.nextItemIndex = 0;
        } else {
            self.nextItemIndex = -1;
        }
    }

    override inline fun getNftStateInit(collectionAddress: Address, index: Int): StateInit {
        return initOf SbtItemMock(collectionAddress, index);
    }

    override inline fun getNftContent(index: Int, individualContent: Cell): Cell {
        let content: StringBuilder = beginTailString();
        content.append("https://base-url/");
        content.append(individualContent.beginParse().asString());
        content.append("/");
        content.append(index.toString());
        return content.toCell();
    }
}
