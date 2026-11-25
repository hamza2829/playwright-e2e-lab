# Change quantities in the cart

Tags: @regression

As a customer
I want to change how many of an item I buy
So that I do not have to add it several times

## Scenario: Raising the quantity updates the subtotal

Given I am logged in as a customer
When I open the products page
And I add "Wireless Mouse" to the cart
And I open the cart
And I set the quantity of "Wireless Mouse" to 3
Then the cart subtotal is "$74.97"
And the cart badge shows 3
