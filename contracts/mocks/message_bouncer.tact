import "@stdlib/deploy";

message(0x6974ca9a) DeploySuccessful {
    queryId: Int as uint64;
    index: Int as uint256;
    owner: Address;
}

contract MessageBouncer with Deployable {

    init() {}

    receive(msg: DeploySuccessful) {
        require(false, "Bouncer");
    }
}