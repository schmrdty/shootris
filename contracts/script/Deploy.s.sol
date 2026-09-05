// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ShootrisSeasons} from "../src/ShootrisSeasons.sol";

/// Deploys ShootrisSeasons to Base. See contracts/README.md for usage.
contract Deploy is Script {
    function run() external {
        address myu = vm.envAddress("MYU_ADDRESS");
        vm.startBroadcast();
        ShootrisSeasons seasons = new ShootrisSeasons(myu);
        console.log("ShootrisSeasons deployed at:", address(seasons));
        vm.stopBroadcast();
    }
}
