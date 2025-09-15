import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestCase {
  id: string;
  title: string;
  description: string;
  steps: Array<{ type: string; content: string }>;
  expectedResult: string;
  priority: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { testCase }: { testCase: TestCase } = await req.json();
    
    console.log('Generating Selenium automation for test case:', testCase.title);

    const seleniumCode = generateSeleniumJavaCode(testCase);

    return new Response(
      JSON.stringify({ 
        success: true, 
        seleniumCode,
        className: sanitizeClassName(testCase.title)
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error generating Selenium automation:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function sanitizeClassName(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, 'Test$&') // Ensure class name doesn't start with number
    + 'Test';
}

function generateSeleniumJavaCode(testCase: TestCase): string {
  const className = sanitizeClassName(testCase.title);
  
  let testSteps = '';
  let stepCounter = 1;
  
  testCase.steps.forEach((step) => {
    const stepComment = `        // Step ${stepCounter}: ${step.content}`;
    const stepCode = generateStepCode(step, stepCounter);
    testSteps += `${stepComment}\n${stepCode}\n\n`;
    stepCounter++;
  });

  return `package com.testautomation.tests;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.By;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
import java.time.Duration;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Automated test for: ${testCase.title}
 * Description: ${testCase.description}
 * Priority: ${testCase.priority}
 */
public class ${className} {
    
    private WebDriver driver;
    private WebDriverWait wait;
    
    @BeforeEach
    public void setUp() {
        // Initialize ChromeDriver
        driver = new ChromeDriver();
        wait = new WebDriverWait(driver, Duration.ofSeconds(10));
        driver.manage().window().maximize();
    }
    
    @Test
    public void test${className.replace('Test', '')}() {
        try {
${testSteps}
            // Verify expected result: ${testCase.expectedResult}
            // Add your verification logic here
            assertTrue(true, "Test completed - verify: ${testCase.expectedResult}");
            
        } catch (Exception e) {
            fail("Test failed with exception: " + e.getMessage());
        }
    }
    
    @AfterEach
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }
}`;
}

function generateStepCode(step: { type: string; content: string }, stepNumber: number): string {
  const content = step.content.toLowerCase();
  
  // Generate appropriate Selenium code based on step content
  if (content.includes('navigate') || content.includes('open') || content.includes('go to')) {
    return `        driver.get("https://your-application-url.com");`;
  } else if (content.includes('click') || content.includes('press')) {
    return `        WebElement element${stepNumber} = wait.until(ExpectedConditions.elementToBeClickable(By.xpath("//button[contains(text(),'button_text')]")));
        element${stepNumber}.click();`;
  } else if (content.includes('enter') || content.includes('type') || content.includes('input')) {
    return `        WebElement inputField${stepNumber} = wait.until(ExpectedConditions.presenceOfElementLocated(By.id("input_id")));
        inputField${stepNumber}.clear();
        inputField${stepNumber}.sendKeys("test_data");`;
  } else if (content.includes('verify') || content.includes('check') || content.includes('assert')) {
    return `        WebElement verificationElement${stepNumber} = wait.until(ExpectedConditions.presenceOfElementLocated(By.xpath("//element_xpath")));
        assertTrue(verificationElement${stepNumber}.isDisplayed(), "Element should be visible");`;
  } else if (content.includes('wait') || content.includes('pause')) {
    return `        Thread.sleep(2000); // Wait for 2 seconds`;
  } else {
    return `        // TODO: Implement step - ${step.content}
        // Add appropriate Selenium WebDriver code here`;
  }
}