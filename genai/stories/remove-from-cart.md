# Remove an item from the cart

Tags: @regression

As a customer
I want to remove items I no longer want
So that I only pay for what I need

## Scenario: Removing the only item empties the cart

Given I am logged in as a customer
When I open the products page
And I add "Desk Mat" to the cart
And I open the cart
And I remove "Desk Mat" from the cart
Then I see the empty cart message
And the cart badge shows 0
