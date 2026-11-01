#pragma once
#include <string>
#include <vector>
#include "nlohmann/json.hpp"

namespace Replay {
struct Pose {
    double time = 0.0;
    float headPos[3]{};
    float headRot[4]{};
    float leftPos[3]{};
    float leftRot[4]{};
    float rightPos[3]{};
    float rightRot[4]{};
};

inline nlohmann::json PoseToJson(const Pose& p, uint64_t seq) {
    nlohmann::json j;
    j["t"] = "pose";
    j["seq"] = seq;
    j["songTime"] = p.time;
    j["head"]["p"] = {p.headPos[0], p.headPos[1], p.headPos[2]};
    j["head"]["q"] = {p.headRot[0], p.headRot[1], p.headRot[2], p.headRot[3]};
    j["left"]["p"] = {p.leftPos[0], p.leftPos[1], p.leftPos[2]};
    j["left"]["q"] = {p.leftRot[0], p.leftRot[1], p.leftRot[2], p.leftRot[3]};
    j["right"]["p"] = {p.rightPos[0], p.rightPos[1], p.rightPos[2]};
    j["right"]["q"] = {p.rightRot[0], p.rightRot[1], p.rightRot[2], p.rightRot[3]};
    return j;
}
}
