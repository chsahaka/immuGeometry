import { ProblemState } from './dsl';

export class GeometryPipeline {
  private MAX_RETRIES = 3;

  /**
   * Grades the problem to determine difficulty and the appropriate model to use.
   * Mocked Gemini API call.
   */
  async grade_problem(input: string): Promise<{ difficulty: string; model: string }> {
    console.log(`Grading problem: "${input}"`);
    // Placeholder logic for grading
    const isHard = input.toLowerCase().includes('hard') || input.length > 100;
    
    return {
      difficulty: isHard ? 'Hard' : 'Easy',
      model: isHard ? 'gemini-3.1-pro-preview' : 'gemini-3.5-flash',
    };
  }

  /**
   * Calls the chosen AI to convert the input into the ProblemState JSON.
   * Mocked Gemini API call.
   */
  async generate_dsl(input: string, model: string, feedback?: string): Promise<ProblemState> {
    console.log(`Generating DSL using model [${model}]. Feedback provided: ${feedback ? 'Yes' : 'No'}`);
    
    // Placeholder response representing a ProblemState
    // In reality, this would send `input` and `feedback` to Gemini, parse the JSON, and instantiate ProblemState
    const mockState = new ProblemState(
      [
        { type: 'Point', id: 'A' }, 
        { type: 'Point', id: 'B' }, 
        { type: 'Line', id: 'L1', points: ['A', 'B'] }
      ],
      [],
      null
    );
    
    return mockState;
  }

  /**
   * Calls a Verifier AI to check the DSL against the input.
   * Mocked Verifier AI.
   */
  async verify_dsl(input: string, generated_dsl: ProblemState): Promise<{ is_correct: boolean; feedback?: string }> {
    console.log(`Verifying DSL...`);
    
    // Placeholder logic: fail if the input contains the word "fail" to test the retry loop
    if (input.toLowerCase().includes('fail')) {
      return { 
        is_correct: false, 
        feedback: 'The generated DSL is missing standard geometric assumptions present in the input.' 
      };
    }
    
    return { is_correct: true };
  }

  /**
   * Orchestrates the parsing pipeline and implements the retry loop.
   */
  async parseProblem(input: string): Promise<ProblemState> {
    const { model } = await this.grade_problem(input);
    let currentFeedback: string | undefined = undefined;
    let retries = 0;

    while (retries < this.MAX_RETRIES) {
      const generatedDsl = await this.generate_dsl(input, model, currentFeedback);
      const verification = await this.verify_dsl(input, generatedDsl);

      if (verification.is_correct) {
        console.log('DSL verified successfully.');
        return generatedDsl;
      }

      console.warn(`Verification failed (Attempt ${retries + 1}/${this.MAX_RETRIES}). Feedback: ${verification.feedback}`);
      currentFeedback = verification.feedback;
      retries++;
    }

    throw new Error('try again');
  }
}
