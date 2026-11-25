# Out-of-stock products

Tags: @regression

As a customer
I want to see which products are sold out
So that I do not try to buy something that cannot ship

## Scenario: A product with no stock cannot be added

Given I am logged in as a customer
And a product "Sold Out Lamp" with stock 0 exists
When I open the products page
Then the product "Sold Out Lamp" is marked out of stock
