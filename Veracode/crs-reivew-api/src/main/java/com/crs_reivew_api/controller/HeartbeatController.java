package com.crs_reivew_api.controller;

import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.HashMap;
import java.util.Map;

@RestController
@CrossOrigin(origins = "*")
public class HeartbeatController {

    @GetMapping("/api/heartbeat")
    public Map<String, Object> getHeartbeat() {
        Map<String, Object> response = new HashMap<>();
        response.put("isServerOnline", true);
        return response;
    }
}
