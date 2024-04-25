import "@stdlib/ownable";
import "@stdlib/deploy";
import "../token/toybuilder/item";

message MockToygerAddress {
    queryId: Int as uint64;
    toygerAddress: Address;
}

contract ToygerMinterMock with Deployable, OwnableTransferable {
    const MIN_TON_FOR_STORAGE: Int = ton("0.03");

    owner: Address;
    toyBuilderCollection: Address;
    toygerAddress: Address?;

    init(toyBuilderCollection: Address) {
        self.owner = sender();
        self.toyBuilderCollection = toyBuilderCollection;

        nativeReserve(self.MIN_TON_FOR_STORAGE, 0);
    }

    // Receivers

    receive(msg: MockToygerAddress) {
        self.requireOwner();
        self.toygerAddress = msg.toygerAddress;

        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: Excesses{ queryId: msg.queryId }.toCell()
        });
    } 

    receive(msg: MintToyger) {
        require(
            sender() == self.getToyBuilderAddressByIndex(msg.toyBuilderId),
            "Only ToyBuilder"
        );

        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: MintToygerSucceeded{
                queryId: msg.queryId,
                toygerAddress: self.toygerAddress!!
            }.toCell()
        });
    }

    // Getters

    get fun get_toybuilder_address_by_index(index: Int): Address {
        return self.getToyBuilderAddressByIndex(index);
    }

    get fun get_toybuilder_collection_address(): Address {
        return self.toyBuilderCollection;
    }

    // Methods

    inline fun getToyBuilderAddressByIndex(index: Int): Address {
        return contractAddress(initOf ToyBuilderItem(self.toyBuilderCollection, index));
    }
}