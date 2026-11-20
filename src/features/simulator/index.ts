/**
 * Blink Simulation Engine (Feature Boundary)
 * Supports repeatable presentation scenarios, simulated blink telemetry, and test nudges.
 */

export interface ISimulatorEngine {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  setScenario(name: 'healthy' | 'fatigued' | 'staring'): void;
}

export class MockSimulatorEngine implements ISimulatorEngine {
  private running = false;
  private scenario: 'healthy' | 'fatigued' | 'staring' = 'healthy';

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  setScenario(scenario: 'healthy' | 'fatigued' | 'staring'): void {
    this.scenario = scenario;
  }

  getScenario(): string {
    return this.scenario;
  }
}
