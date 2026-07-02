package com.crs_reivew_api.service;

import com.crs_reivew_api.config.VeracodeConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

public class VeracodeServiceTest {

    @InjectMocks
    private VeracodeService veracodeService;

    @Mock
    private VeracodeConfig veracodeConfig;

    @BeforeEach
    public void setUp() {
        MockitoAnnotations.openMocks(this);
    }

    @Test
    public void testIsModuleIgnored_SystemDotNetAssemblies() {
        // Mock ignore modules list containing standard ignores
        when(veracodeConfig.getIgnoreModules()).thenReturn(Arrays.asList("Microsoft", "Azure", "System", "AspNetCore"));

        // Standard system assemblies should be ignored
        assertTrue(veracodeService.isModuleIgnored("System.dll", null));
        assertTrue(veracodeService.isModuleIgnored("System.Web.dll", null));
        assertTrue(veracodeService.isModuleIgnored("Microsoft.Extensions.Logging.dll", null));
        assertTrue(veracodeService.isModuleIgnored("Azure.Identity.dll", null));
        assertTrue(veracodeService.isModuleIgnored("MyCompany.System.dll", null));
    }

    @Test
    public void testIsModuleIgnored_CustomModulesShouldNotBeIgnored() {
        when(veracodeConfig.getIgnoreModules()).thenReturn(Arrays.asList("Microsoft", "Azure", "System", "AspNetCore"));

        // Custom archives containing 'system', 'microsoft', or 'azure' as part of their names should NOT be ignored
        assertFalse(veracodeService.isModuleIgnored("Python files within veracode-auto-pack-api-biz-system-review-workspace-python.zip", "veracode-auto-pack-api-biz-system-review-workspace-python.zip"));
        assertFalse(veracodeService.isModuleIgnored("JS files within microsoft-teams-integration-js.zip", "microsoft-teams-integration-js.zip"));
        assertFalse(veracodeService.isModuleIgnored("Python files within azure-storage-service-python.zip", "azure-storage-service-python.zip"));
    }

    @Test
    public void testIsModuleIgnored_OtherIgnoredModules() {
        when(veracodeConfig.getIgnoreModules()).thenReturn(Arrays.asList("Newtonsoft", "BouncyCastle", ".map"));

        // Other ignores should continue to use contains check
        assertTrue(veracodeService.isModuleIgnored("Newtonsoft.Json.dll", null));
        assertTrue(veracodeService.isModuleIgnored("my-library.js.map", null));
        assertFalse(veracodeService.isModuleIgnored("CustomLibrary.dll", null));
    }
}
