// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Hound} from "../src/Hound.sol";
import {BlockHound} from "../src/BlockHound.sol";
import {IPriceFeed, IAgentRegistry} from "../src/HashMint.sol";

/// Yayın: HAZINE=0x... forge script script/Yayinla.s.sol --rpc-url bsc --account <keystore> --broadcast
/// Kurulumdan sonra hiçbir değer değiştirilemez; sayıları yayından önce kontrol et.
contract Yayinla is Script {
    // Chainlink BNB / USD, BSC ana ağ
    address constant BNB_USD = 0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE;
    // Binance Agent ID kayıt kontratı, BSC ana ağ
    address constant AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    function run() external returns (Hound hound, BlockHound nft) {
        address hazine = vm.envAddress("HAZINE");
        address besleme = vm.envOr("FIYAT_BESLEME", BNB_USD);
        address kayit = vm.envOr("AGENT_KAYIT", AGENT_ID);
        vm.startBroadcast();
        // 10.000 HOUND = 0.50 dolar, 20 bitten başlar, her 1.000 mintte bir bit zorlaşır
        hound = new Hound(IPriceFeed(besleme), IAgentRegistry(kayit), hazine, 50_000_000, 1_000, 20);
        // 1 BlockHound = 0.10 dolar, 20 bitten başlar, her 250 mintte bir bit zorlaşır
        nft = new BlockHound(IPriceFeed(besleme), IAgentRegistry(kayit), hazine, 10_000_000, 250, 20);
        vm.stopBroadcast();
        console.log("HOUND", address(hound));
        console.log("BlockHound", address(nft));
    }
}
