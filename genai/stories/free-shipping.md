# Free shipping over $50

Tags: @regression

As a customer
I want free shipping on orders of $50 or more
So that larger orders do not cost extra to deliver

## Scenario: A keyboard order ships for free

Given I am logged in as a customer
When I open the products page
And I add "Mechanical Keyboard" to the cart
And I open the cart
Then the shipping is "Free"
And the cart total is "$79.99"
