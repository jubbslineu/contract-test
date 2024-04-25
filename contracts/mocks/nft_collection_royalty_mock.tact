import "../token/traits/nft/collection.tact";
import "./nft_item_mock";

contract NftCollectionRoyaltyMock with NftCollection, NftRoyaltiesExtension {

    // Storage

    nextItemIndex: Int as int256;
    collectionContent: Cell;
    owner: Address;
    minter: Address;
    royaltyNumerator: Int as uint16;
    royaltyDenominator: Int as uint16;
    royaltyDestination: Address;

    init(collectionContent: Cell, isSequential: Bool) {
        self.owner = newAddress(0, 0);
        self.minter = newAddress(0, 0);
        self.collectionContent = collectionContent;
        if (isSequential) {
            self.nextItemIndex = 0;
        } else {
            self.nextItemIndex = -1;
        }
        self.royaltyNumerator = 0;
        self.royaltyDenominator = 0;
        self.royaltyDestination = newAddress(0, 0);
    }

    override inline fun getNftStateInit(collectionAddress: Address, index: Int): StateInit {
        return initOf NftItemMock(collectionAddress, index);
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