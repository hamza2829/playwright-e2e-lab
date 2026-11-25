# Place an order

Tags: @smoke @regression

As a customer
I want to check out the items in my cart
So that they are delivered to me

## Scenario: Checkout with valid details confirms the order

Given I am logged in as a customer
When I open the products page
And I add "Laptop Stand" to the cart
And I open the cart
And I proceed to checkout
And I place the order with valid shipping details
Then I see an order confirmation
And the cart badge shows 0
