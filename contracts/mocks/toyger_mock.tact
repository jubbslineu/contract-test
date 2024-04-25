import "@stdlib/deploy";
import "../token/toybuilder/messages";

message(0xd53276db) Excesses {
    queryId: Int as uint64;
}

contract ToygerMock with Deployable {
    const MIN_TON_FOR_STORAGE: Int = ton("0.03");

    owner: Address;

    init(owner: Address) {
        self.owner = owner;

        nativeReserve(self.MIN_TON_FOR_STORAGE, 0);
    }

    // Receivers

    receive(msg: Transfer) {
        require(sender() == self.owner, "Only owner");

        self.owner = msg.newOwner;

        send(SendParameters{
            to: msg.responseDestination,
            value: 0,
            mode: SendRemainingValue,
            body: Excesses{ queryId: msg.queryId }.toCell()
        });
    }

    // Getters

    get fun get_owner(): Address {
        return self.owner;
    }
}