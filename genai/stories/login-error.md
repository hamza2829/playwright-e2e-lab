# Helpful login errors

Tags: @regression

As a customer who mistyped a password
I want a clear error message
So that I know to try again

## Scenario: Wrong password is rejected

Given I am not logged in
When I sign in as "alice" with password "wrong-password"
Then I see the error "Invalid username or password."
And I am still on the login page
