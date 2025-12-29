import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Play,
  X,
  Download,
  Copy,
  RotateCw,
  FileCode,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

interface CodeEditorProps {
  onClose: () => void;
  onCompile?: (code: string) => void;
  onCodeChange?: (code: string) => void;
  value?: string; // External code value to sync with
}

interface SyntaxError {
  line: number;
  message: string;
  type: "error" | "warning";
}

export const CodeEditor = ({
  onClose,
  onCompile,
  onCodeChange,
  value: externalValue,
}: CodeEditorProps) => {
  const [code, setCode] = useState(externalValue || `void setup() {
  // Set pin 9 as output for LED
  pinMode(9, OUTPUT);

  Serial.begin(9600);
  Serial.println("Arduino is ready!");
}

void loop() {
  // Blink the LED
  digitalWrite(9, HIGH);
  delay(1000);
  digitalWrite(9, LOW);
  delay(1000);

  Serial.println("LED blinked!");
}`);

  const [status, setStatus] = useState<
    "idle" | "compiling" | "success" | "error"
  >("idle");
  const [syntaxErrors, setSyntaxErrors] = useState<SyntaxError[]>([]);

  // Sync with external value when it changes
  useEffect(() => {
    if (externalValue !== undefined && externalValue !== code) {
      console.log('🔄 CodeEditor syncing with external value:', externalValue);
      setCode(externalValue);
    }
  }, [externalValue]);

  // Comprehensive Arduino syntax validation
  const validateArduinoCode = (code: string): SyntaxError[] => {
    const errors: SyntaxError[] = [];
    const lines = code.split("\n");

    // Check for required functions
    if (!code.includes("void setup()")) {
      errors.push({
        line: 1,
        message: "Missing required function: void setup()",
        type: "error",
      });
    }

    if (!code.includes("void loop()")) {
      errors.push({
        line: 1,
        message: "Missing required function: void loop()",
        type: "error",
      });
    }

    // Check for bracket matching
    let openBrackets = 0;
    let openParens = 0;

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Count brackets and parentheses
      for (const char of line) {
        if (char === "{") openBrackets++;
        if (char === "}") openBrackets--;
        if (char === "(") openParens++;
        if (char === ")") openParens--;

        // Check for negative bracket count (more closing than opening)
        if (openBrackets < 0) {
          errors.push({
            line: lineNum,
            message: "Unexpected closing bracket }",
            type: "error",
          });
        }
        if (openParens < 0) {
          errors.push({
            line: lineNum,
            message: "Unexpected closing parenthesis )",
            type: "error",
          });
        }
      }

      // Check for missing semicolons (basic check)
      const trimmedLine = line.trim();
      if (
        trimmedLine &&
        !trimmedLine.startsWith("//") &&
        !trimmedLine.startsWith("/*") &&
        !trimmedLine.endsWith("{") &&
        !trimmedLine.endsWith("}") &&
        !trimmedLine.endsWith(";") &&
        !trimmedLine.includes("#") &&
        trimmedLine !== "" &&
        !trimmedLine.startsWith("void") &&
        !trimmedLine.startsWith("int") &&
        !trimmedLine.startsWith("float") &&
        !trimmedLine.startsWith("char") &&
        !trimmedLine.startsWith("bool") &&
        !trimmedLine.startsWith("if") &&
        !trimmedLine.startsWith("for") &&
        !trimmedLine.startsWith("while") &&
        !trimmedLine.startsWith("else")
      ) {
        errors.push({
          line: lineNum,
          message: "Missing semicolon at end of statement",
          type: "error",
        });
      }

      // Check for invalid pin numbers in common functions
      const digitaWriteMatch = line.match(
        /digitalWrite\((\d+),\s*(HIGH|LOW)\)/,
      );
      if (digitaWriteMatch) {
        const pin = parseInt(digitaWriteMatch[1]);
        if (pin > 13) {
          errors.push({
            line: lineNum,
            message: `Invalid digital pin ${pin}. Arduino UNO digital pins are 0-13`,
            type: "error",
          });
        }
      }

      const analogWriteMatch = line.match(/analogWrite\((\d+),\s*(\d+)\)/);
      if (analogWriteMatch) {
        const pin = parseInt(analogWriteMatch[1]);
        const value = parseInt(analogWriteMatch[2]);

        // Check PWM pins (3, 5, 6, 9, 10, 11 on Arduino UNO)
        if (![3, 5, 6, 9, 10, 11].includes(pin)) {
          errors.push({
            line: lineNum,
            message: `Pin ${pin} is not a PWM pin. Use pins 3, 5, 6, 9, 10, or 11 for analogWrite()`,
            type: "error",
          });
        }

        if (value < 0 || value > 255) {
          errors.push({
            line: lineNum,
            message: `analogWrite value ${value} out of range. Must be 0-255`,
            type: "error",
          });
        }
      }

      const analogReadMatch = line.match(/analogRead\((\d+)\)/);
      if (analogReadMatch) {
        const pin = parseInt(analogReadMatch[1]);
        if (pin > 5) {
          errors.push({
            line: lineNum,
            message: `Invalid analog pin A${pin}. Arduino UNO analog pins are A0-A5`,
            type: "error",
          });
        }
      }

      const pinModeMatch = line.match(
        /pinMode\((\d+),\s*(INPUT|OUTPUT|INPUT_PULLUP)\)/,
      );
      if (pinModeMatch) {
        const pin = parseInt(pinModeMatch[1]);
        if (pin > 13) {
          errors.push({
            line: lineNum,
            message: `Invalid pin ${pin} in pinMode(). Digital pins are 0-13`,
            type: "error",
          });
        }
      }

      // Check for common typos
      if (line.includes("digitalwrite") || line.includes("DigitalWrite")) {
        errors.push({
          line: lineNum,
          message: 'Function name should be "digitalWrite" (capital W)',
          type: "error",
        });
      }

      if (line.includes("pinmode") || line.includes("PinMode")) {
        errors.push({
          line: lineNum,
          message: 'Function name should be "pinMode" (capital M)',
          type: "error",
        });
      }

      // Check for undefined variables (basic check)
      const variableMatch = line.match(/(\w+)\s*=/);
      if (
        variableMatch &&
        !line.includes("int ") &&
        !line.includes("float ") &&
        !line.includes("char ") &&
        !line.includes("bool ") &&
        !line.includes("String ") &&
        !line.includes("const ")
      ) {
        const varName = variableMatch[1];
        if (
          !code.includes(`int ${varName}`) &&
          !code.includes(`float ${varName}`) &&
          !code.includes(`char ${varName}`) &&
          !code.includes(`bool ${varName}`) &&
          !code.includes(`String ${varName}`) &&
          !["HIGH", "LOW", "INPUT", "OUTPUT", "INPUT_PULLUP"].includes(varName)
        ) {
          errors.push({
            line: lineNum,
            message: `Variable '${varName}' may not be declared`,
            type: "warning",
          });
        }
      }

      // Check for delay validation
      const delayMatch = line.match(/delay\((\d+)\)/);
      if (delayMatch) {
        const delayValue = parseInt(delayMatch[1]);
        if (delayValue > 10000) {
          errors.push({
            line: lineNum,
            message: `Delay of ${delayValue}ms is very long. Consider using smaller values`,
            type: "warning",
          });
        }
      }
    });

    // Final bracket count check
    if (openBrackets > 0) {
      errors.push({
        line: lines.length,
        message: `Missing ${openBrackets} closing bracket(s) }`,
        type: "error",
      });
    }

    if (openParens > 0) {
      errors.push({
        line: lines.length,
        message: `Missing ${openParens} closing parenthesis(es) )`,
        type: "error",
      });
    }

    return errors;
  };

  const handleCompile = () => {
    setStatus("compiling");
    setSyntaxErrors([]);

    // Validate syntax locally first
    const errors = validateArduinoCode(code);
    const hasErrors = errors.some((e) => e.type === "error");
    const hasWarnings = errors.some((e) => e.type === "warning");

    setSyntaxErrors(errors);

    if (hasErrors) {
      setStatus("error");
      toast.error(
        `❌ Compilation failed! Found ${errors.filter((e) => e.type === "error").length} error(s)`,
      );
      return;
    }

    // If no local errors, call the real compiler
    if (onCompile) {
      // Real compilation happens here - this will use Arduino CLI + AVR8.js
      onCompile(code);

      // Set success after a delay (real compilation is async)
      setTimeout(() => {
        setStatus("success");
        if (hasWarnings) {
          toast.warning(
            `⚠️ Compiled with ${errors.filter((e) => e.type === "warning").length} warning(s)`,
          );
        } else {
          toast.success("✅ Code compiled successfully!");
        }
      }, 1500);
    } else {
      // Fallback if no onCompile provided
      setStatus("success");
      toast.success("✅ Code validated successfully!");
    }
  };

  const handleUpload = async () => {
    // Upload means: compile with Arduino CLI and upload to AVR8js
    console.log('🚀 Upload button clicked - starting real compilation...');
    setStatus("compiling");
    setSyntaxErrors([]);

    // Validate syntax locally first
    const errors = validateArduinoCode(code);
    const hasErrors = errors.some((e) => e.type === "error");
    const hasWarnings = errors.some((e) => e.type === "warning");

    setSyntaxErrors(errors);

    if (hasErrors) {
      setStatus("error");
      toast.error(
        `❌ Compilation failed! Found ${errors.filter((e) => e.type === "error").length} error(s)`,
      );
      return;
    }

    // Call the real compiler via onCompile callback
    if (onCompile) {
      console.log('📤 Calling onCompile to trigger Arduino CLI compilation...');
      try {
        // onCompile is async in SimulationCanvas, so we await it
        await onCompile(code);

        // Set success after compilation
        setStatus("success");
        if (hasWarnings) {
          toast.warning(
            `⚠️ Uploaded with ${errors.filter((e) => e.type === "warning").length} warning(s)`,
          );
        } else {
          toast.success("✅ Code uploaded and running!");
        }
      } catch (error) {
        console.error('❌ Upload failed:', error);
        setStatus("error");
        toast.error("❌ Upload failed! Check console for details.");
      }
    } else {
      // Fallback if no onCompile provided
      setStatus("success");
      toast.success("✅ Code validated successfully!");
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied to clipboard!");
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "arduino_code.ino";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Code downloaded!");
  };

  const handleReset = () => {
    setCode(`void setup() {
  // Initialize serial communication
  Serial.begin(9600);

  // Set pin 9 as output (built-in LED)
  pinMode(9, OUTPUT);

  Serial.println("Arduino is ready!");
}

void loop() {
  // Blink the LED
  digitalWrite(9, HIGH);
  delay(1000);
  digitalWrite(9, LOW);
  delay(1000);

  Serial.println("LED blinked!");
}`);
    setStatus("idle");
    setSyntaxErrors([]);
  };

  return (
    <Card className="fixed right-0 top-0 h-full w-[500px] bg-card border-l shadow-lg z-40">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between bg-muted/50">
        <div className="flex items-center gap-2">
          <FileCode className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Arduino IDE</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Toolbar */}
      <div className="p-3 border-b flex items-center gap-2 bg-muted/30">
        <Button
          size="sm"
          onClick={handleCompile}
          disabled={status === "compiling"}
          className="flex-1"
        >
          {status === "compiling" ? (
            <RotateCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4 mr-2" />
          )}
          Compile
        </Button>

        <Button
          size="sm"
          onClick={handleUpload}
          disabled={status === "compiling"}
          variant="default"
          className="flex-1 bg-green-600 hover:bg-green-700"
          title="Compile with Arduino CLI and upload to simulator"
        >
          <Play className="h-4 w-4 mr-2" />
          Upload & Run
        </Button>

        <Button size="sm" variant="outline" onClick={handleCopy}>
          <Copy className="h-4 w-4" />
        </Button>

        <Button size="sm" variant="outline" onClick={handleDownload}>
          <Download className="h-4 w-4" />
        </Button>

        <Button size="sm" variant="ghost" onClick={handleReset}>
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Status Bar */}
      {status !== "idle" && (
        <div
          className={`px-4 py-2 flex items-center gap-2 ${status === "success"
            ? "bg-green-500/10 text-green-600"
            : status === "error"
              ? "bg-red-500/10 text-red-600"
              : "bg-blue-500/10 text-blue-600"
            }`}
        >
          {status === "compiling" && (
            <>
              <RotateCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">Compiling Arduino code...</span>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm">Ready to upload!</span>
            </>
          )}
          {status === "error" && (
            <>
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Compilation failed</span>
            </>
          )}
        </div>
      )}

      {/* Errors and Warnings */}
      {syntaxErrors.length > 0 && (
        <div className="px-4 py-2 bg-red-500/10 border-b max-h-40 overflow-y-auto">
          <h4 className="text-sm font-semibold mb-2 text-red-700">
            Problems ({syntaxErrors.filter((e) => e.type === "error").length}{" "}
            errors, {syntaxErrors.filter((e) => e.type === "warning").length}{" "}
            warnings)
          </h4>
          {syntaxErrors.map((error, index) => (
            <div
              key={index}
              className={`text-xs mb-1 flex items-start gap-2 ${error.type === "error" ? "text-red-600" : "text-orange-600"
                }`}
            >
              {error.type === "error" ? (
                <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <span className="font-mono">Line {error.line}:</span>{" "}
                {error.message}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Code Editor */}
      <div className="p-4 h-[calc(100vh-240px)] overflow-hidden">
        <div className="relative h-full">
          <Textarea
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (onCodeChange) {
                onCodeChange(e.target.value);
              }
              // Clear errors when code changes
              if (syntaxErrors.length > 0) {
                setSyntaxErrors([]);
                setStatus("idle");
              }
            }}
            placeholder="Write your Arduino code here..."
            className="w-full h-full font-mono text-sm resize-none bg-background"
            spellCheck={false}
          />

          {/* Line numbers overlay */}
          <div className="absolute left-2 top-2 text-xs text-muted-foreground font-mono pointer-events-none select-none">
            {code.split("\n").map((_, index) => (
              <div key={index} className="h-[20px] leading-[20px]">
                {index + 1}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Code Helpers */}
      <div className="p-4 bg-muted/50">
        <div className="p-3 bg-background/50 rounded-lg">
          <p className="text-xs font-semibold mb-2">Arduino Functions:</p>
          <ul className="text-xs space-y-1 text-muted-foreground">
            <li>
              • <code className="bg-muted px-1 rounded">void setup()</code> -
              Runs once at startup
            </li>
            <li>
              • <code className="bg-muted px-1 rounded">void loop()</code> -
              Runs continuously
            </li>
            <li>
              •{" "}
              <code className="bg-muted px-1 rounded">pinMode(pin, mode)</code>{" "}
              - Set pin as INPUT/OUTPUT
            </li>
            <li>
              •{" "}
              <code className="bg-muted px-1 rounded">
                digitalWrite(pin, value)
              </code>{" "}
              - Set digital pin HIGH/LOW
            </li>
            <li>
              •{" "}
              <code className="bg-muted px-1 rounded">
                analogWrite(pin, value)
              </code>{" "}
              - PWM output (0-255)
            </li>
            <li>
              •{" "}
              <code className="bg-muted px-1 rounded">delay(milliseconds)</code>{" "}
              - Wait/pause execution
            </li>
            <li>
              • PWM pins: <strong>3, 5, 6, 9, 10, 11</strong> | Digital pins:{" "}
              <strong>0-13</strong>
            </li>
          </ul>
        </div>
      </div>
    </Card>
  );
};
