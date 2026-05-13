package com.crs_reivew_api.controller;

import com.crs_reivew_api.service.AiService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.Map;
import java.util.HashMap;

@RestController
@RequestMapping("/api/ai")
@CrossOrigin(origins = "*")
public class AiController {

    private static final Logger logger = LoggerFactory.getLogger(AiController.class);

    @Autowired
    private AiService aiService;

    @Autowired
    private com.crs_reivew_api.config.VeracodeConfig veracodeConfig;

    @PostMapping("/analyze")
    public Map<String, Object> analyze(@RequestBody Map<String, String> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            String engine = payload.get("engine");
            String prompt = payload.get("prompt");
            String type = payload.get("type");
            String flawId = payload.get("flawId");
            String flawSummary = payload.get("flawSummary");

            if (engine == null || engine.isEmpty()) engine = "gemini";
            if (prompt == null || prompt.isEmpty()) throw new IllegalArgumentException("Prompt is required");

            String fullPrompt = prompt;
            if ("SAST".equalsIgnoreCase(type)) {
                fullPrompt = veracodeConfig.getSastPrompt() + "\n\n" +
                             "this is the flaw id " + flawId + "\n" +
                             flawSummary + "\n\n" + prompt;
            } else if ("SCA".equalsIgnoreCase(type)) {
                fullPrompt = veracodeConfig.getScaPrompt() + "\n\n" +
                             "this is the flaw id " + flawId + "\n" +
                             flawSummary + "\n\n" + prompt;
            }

            logger.info("Analyzing with engine: {}, type: {}", engine, type);
            AiService.AiResult result = aiService.callAi(engine, fullPrompt);
            response.put("status", "success");
            response.put("result", result.text);
            response.put("in", result.inTokens);
            response.put("out", result.outTokens);
            response.put("engine", engine);
        } catch (Exception e) {
            logger.error("AI analysis error: {}", e.getMessage(), e);
            response.put("status", "error");
            response.put("message", e.getMessage());
        }
        return response;
    }
}
