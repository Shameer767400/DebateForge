describe('Debate Flow E2E', () => {
  beforeEach(() => {
    // Reset database or mock API responses here
    cy.visit('/');
  });

  it('allows a user to navigate to the lobby and start a debate', () => {
    // Mock authentication
    window.localStorage.setItem('token', 'mock_jwt_token');
    
    cy.visit('/lobby');
    cy.contains('Debate Settings').should('be.visible');
    
    // Select a topic
    cy.get('input[placeholder*="Search topics"]').type('AI');
    cy.contains('AI will replace most jobs').click();
    
    // Select side
    cy.contains('For').click();
    
    // Start debate
    cy.contains('Start Debate').click();
    
    // Should navigate to debate room
    cy.url().should('include', '/debate/');
    cy.contains('Connecting...').should('be.visible');
  });

  it('renders the Dashboard completely', () => {
    window.localStorage.setItem('token', 'mock_jwt_token');
    cy.visit('/dashboard');
    cy.contains('Habit Tracker').should('be.visible');
    cy.contains('Your Fallacy DNA').should('be.visible');
    cy.contains('Score Trends').should('be.visible');
  });
});
